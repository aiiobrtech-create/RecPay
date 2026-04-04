import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import {
  billingEvents,
  billingStatements,
  chargeAttempts,
  events,
  tenants,
  type DbClient,
} from "@re/db";
import Stripe from "stripe";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function centsFromAmount(amount: number | null): number {
  if (amount == null || !Number.isFinite(amount)) return 0;
  if (Number.isInteger(amount) && Math.abs(amount) >= 1000) return Math.trunc(amount);
  return Math.round(amount * 100);
}

function eventTypeFromCanonical(canonical: Record<string, unknown>): string {
  const raw = canonical.eventType;
  return typeof raw === "string" ? raw : "unknown";
}

function canonicalOccurredAt(canonical: Record<string, unknown>, fallback: Date): Date {
  const raw = canonical.occurredAt;
  if (typeof raw === "string") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function canonicalOrder(canonical: Record<string, unknown>): Record<string, unknown> {
  return asObject(canonical.order);
}

function canonicalCustomer(canonical: Record<string, unknown>): Record<string, unknown> {
  return asObject(canonical.customer);
}

function canonicalPayment(canonical: Record<string, unknown>): Record<string, unknown> {
  return asObject(canonical.payment);
}

function commissionFromBps(amountCents: number, bps: number): number {
  return Math.round((amountCents * bps) / 10_000);
}

function isReversalStatus(statusRaw: string | null): boolean {
  const status = statusRaw?.toLowerCase() ?? "";
  return ["refunded", "refund", "chargeback", "canceled", "cancelled"].some((item) =>
    status.includes(item),
  );
}

function clampBillingAnchorDay(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(28, Math.trunc(value)));
}

function anchorDateUtc(year: number, monthIndex: number, anchorDay: number): Date {
  return new Date(Date.UTC(year, monthIndex, anchorDay, 0, 0, 0, 0));
}

export function resolveClosedBillingPeriod(now: Date, anchorDay: number): {
  periodStart: Date;
  periodEnd: Date;
} {
  const normalizedAnchor = clampBillingAnchorDay(anchorDay);
  const currentAnchor = anchorDateUtc(now.getUTCFullYear(), now.getUTCMonth(), normalizedAnchor);
  const end =
    now.getTime() >= currentAnchor.getTime()
      ? currentAnchor
      : anchorDateUtc(now.getUTCFullYear(), now.getUTCMonth() - 1, normalizedAnchor);
  const start = anchorDateUtc(end.getUTCFullYear(), end.getUTCMonth() - 1, normalizedAnchor);
  return { periodStart: start, periodEnd: end };
}

async function findTenantBillingConfig(db: DbClient, tenantId: string) {
  const [tenant] = await db
    .select({
      id: tenants.id,
      stripeCustomerId: tenants.stripeCustomerId,
      stripeDefaultPaymentMethodId: tenants.stripeDefaultPaymentMethodId,
      monthlyFeeCents: tenants.monthlyFeeCents,
      successFeeBps: tenants.successFeeBps,
      billingCycleAnchorDay: tenants.billingCycleAnchorDay,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return tenant ?? null;
}

export async function syncBillingEventForSourceEvent(params: {
  db: DbClient;
  eventRow: typeof events.$inferSelect;
  canonical: Record<string, unknown>;
}): Promise<void> {
  const { db, eventRow, canonical } = params;
  const tenant = await findTenantBillingConfig(db, eventRow.tenantId);
  if (!tenant) return;

  const order = canonicalOrder(canonical);
  const customer = canonicalCustomer(canonical);
  const payment = canonicalPayment(canonical);
  const externalOrderId =
    pickString(order, ["externalId", "id", "orderId", "order_id"]) ?? eventRow.id;
  const debtorReference = pickString(customer, ["externalId", "id", "email", "phone"]);
  const recoveredAmountCents = centsFromAmount(pickNumber(order, ["amountCents", "amount"]));
  const currency = pickString(order, ["currency"]) ?? "BRL";
  const occurredAt = canonicalOccurredAt(canonical, eventRow.createdAt);
  const eventType = eventTypeFromCanonical(canonical);
  const statusRaw = pickString(payment, ["statusRaw", "status"]);

  if (eventType === "payment_approved" && recoveredAmountCents > 0) {
    const commissionRateBps = tenant.successFeeBps ?? 500;
    const commissionAmountCents = commissionFromBps(recoveredAmountCents, commissionRateBps);
    await db
      .insert(billingEvents)
      .values({
        tenantId: eventRow.tenantId,
        sourceEventId: eventRow.id,
        externalReference: externalOrderId,
        debtorReference,
        recoveredAmountCents,
        currency,
        occurredAt,
        commissionRateBps,
        commissionAmountCents,
        status: "billable",
      })
      .onConflictDoNothing({
        target: [billingEvents.tenantId, billingEvents.externalReference],
      });
    return;
  }

  if (eventType !== "payment_failed" || !isReversalStatus(statusRaw) || recoveredAmountCents <= 0) {
    return;
  }

  const reversalReference = `${externalOrderId}:reversal`;
  const [existingOriginal] = await db
    .select({
      id: billingEvents.id,
      commissionRateBps: billingEvents.commissionRateBps,
      status: billingEvents.status,
    })
    .from(billingEvents)
    .where(and(eq(billingEvents.tenantId, eventRow.tenantId), eq(billingEvents.externalReference, externalOrderId)))
    .limit(1);

  if (!existingOriginal) return;

  await db
    .insert(billingEvents)
    .values({
      tenantId: eventRow.tenantId,
      sourceEventId: eventRow.id,
      externalReference: reversalReference,
      debtorReference,
      recoveredAmountCents: -Math.abs(recoveredAmountCents),
      currency,
      occurredAt,
      commissionRateBps: existingOriginal.commissionRateBps,
      commissionAmountCents: -commissionFromBps(
        Math.abs(recoveredAmountCents),
        existingOriginal.commissionRateBps,
      ),
      status: "billable",
      reversalOfBillingEventId: existingOriginal.id,
    })
    .onConflictDoNothing({
      target: [billingEvents.tenantId, billingEvents.externalReference],
    });

  if (existingOriginal.status === "billable") {
    await db
      .update(billingEvents)
      .set({ status: "reversed" })
      .where(eq(billingEvents.id, existingOriginal.id));
  }
}

type StatementPreview = {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  recoveredTotalCents: number;
  commissionTotalCents: number;
  monthlyFeeCents: number;
  grandTotalCents: number;
  eventCount: number;
};

export async function previewBillingStatement(params: {
  db: DbClient;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<StatementPreview> {
  const { db, tenantId, periodStart, periodEnd } = params;
  const tenant = await findTenantBillingConfig(db, tenantId);
  if (!tenant) {
    throw new Error("tenant_not_found");
  }

  const rows = await db
    .select({
      recoveredAmountCents: billingEvents.recoveredAmountCents,
      commissionAmountCents: billingEvents.commissionAmountCents,
    })
    .from(billingEvents)
    .where(
      and(
        eq(billingEvents.tenantId, tenantId),
        eq(billingEvents.status, "billable"),
        isNull(billingEvents.billingStatementId),
        gte(billingEvents.occurredAt, periodStart),
        lt(billingEvents.occurredAt, periodEnd),
      ),
    )
    .orderBy(asc(billingEvents.occurredAt));

  const recoveredTotalCents = rows.reduce((sum, row) => sum + row.recoveredAmountCents, 0);
  const commissionTotalCents = rows.reduce((sum, row) => sum + row.commissionAmountCents, 0);
  const monthlyFeeCents = tenant.monthlyFeeCents ?? 0;

  return {
    tenantId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    recoveredTotalCents,
    commissionTotalCents,
    monthlyFeeCents,
    grandTotalCents: commissionTotalCents + monthlyFeeCents,
    eventCount: rows.length,
  };
}

async function ensureStripeClient(): Promise<Stripe> {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!apiKey) throw new Error("stripe_not_configured");
  return new Stripe(apiKey);
}

async function resolveCustomerPaymentMethod(
  stripe: Stripe,
  customerId: string | null,
  paymentMethodId: string | null,
): Promise<string | null> {
  if (paymentMethodId) return paymentMethodId;
  if (!customerId) return null;
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  const defaultPm = customer.invoice_settings.default_payment_method;
  if (typeof defaultPm === "string" && defaultPm.trim()) return defaultPm;
  if (defaultPm && typeof defaultPm === "object" && "id" in defaultPm) {
    return typeof defaultPm.id === "string" ? defaultPm.id : null;
  }
  return null;
}

async function chargeStatement(params: {
  db: DbClient;
  statementId: string;
}): Promise<{
  status: "paid" | "failed";
  chargeId: string | null;
  failureReason: string | null;
}> {
  const { db, statementId } = params;
  const [row] = await db
    .select({
      statementId: billingStatements.id,
      tenantId: billingStatements.tenantId,
      grandTotalCents: billingStatements.grandTotalCents,
      tenantStripeCustomerId: tenants.stripeCustomerId,
      tenantStripeDefaultPaymentMethodId: tenants.stripeDefaultPaymentMethodId,
    })
    .from(billingStatements)
    .innerJoin(tenants, eq(billingStatements.tenantId, tenants.id))
    .where(eq(billingStatements.id, statementId))
    .limit(1);

  if (!row) throw new Error("statement_not_found");
  if (row.grandTotalCents <= 0) {
    return { status: "paid", chargeId: null, failureReason: null };
  }

  const stripe = await ensureStripeClient();
  const paymentMethodId = await resolveCustomerPaymentMethod(
    stripe,
    row.tenantStripeCustomerId,
    row.tenantStripeDefaultPaymentMethodId,
  );
  if (!row.tenantStripeCustomerId || !paymentMethodId) {
    return { status: "failed", chargeId: null, failureReason: "missing_payment_method" };
  }

  const intent = await stripe.paymentIntents.create({
    amount: row.grandTotalCents,
    currency: "brl",
    customer: row.tenantStripeCustomerId,
    payment_method: paymentMethodId,
    confirm: true,
    off_session: true,
    metadata: {
      statementId: row.statementId,
      tenantId: row.tenantId,
      billingType: "success_fee_monthly_close",
    },
  });

  if (intent.status === "succeeded") {
    await db
      .update(tenants)
      .set({ stripeDefaultPaymentMethodId: paymentMethodId })
      .where(eq(tenants.id, row.tenantId));
    return { status: "paid", chargeId: intent.id, failureReason: null };
  }

  return {
    status: "failed",
    chargeId: intent.id,
    failureReason: intent.last_payment_error?.message ?? intent.status,
  };
}

export async function closeBillingCycle(params: {
  db: DbClient;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  chargeNow?: boolean;
}): Promise<{
  duplicate: boolean;
  statementId: string;
  status: string;
  preview: StatementPreview;
  charge: { status: "paid" | "failed" | "skipped"; failureReason: string | null } | null;
}> {
  const { db, tenantId, periodStart, periodEnd, chargeNow = true } = params;
  const tenant = await findTenantBillingConfig(db, tenantId);
  if (!tenant) throw new Error("tenant_not_found");

  const preview = await previewBillingStatement({ db, tenantId, periodStart, periodEnd });

  const [existing] = await db
    .select({
      id: billingStatements.id,
      status: billingStatements.status,
    })
    .from(billingStatements)
    .where(
      and(
        eq(billingStatements.tenantId, tenantId),
        eq(billingStatements.periodStart, periodStart),
        eq(billingStatements.periodEnd, periodEnd),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      duplicate: true,
      statementId: existing.id,
      status: existing.status,
      preview,
      charge: null,
    };
  }

  const statementId = await db.transaction(async (tx) => {
    const [statement] = await tx
      .insert(billingStatements)
      .values({
        tenantId,
        periodStart,
        periodEnd,
        recoveredTotalCents: preview.recoveredTotalCents,
        commissionTotalCents: preview.commissionTotalCents,
        monthlyFeeCents: preview.monthlyFeeCents,
        grandTotalCents: preview.grandTotalCents,
        status: "finalized",
        finalizedAt: new Date(),
      })
      .returning({ id: billingStatements.id });
    if (!statement) throw new Error("statement_insert_failed");

    await tx
      .update(billingEvents)
      .set({ billingStatementId: statement.id })
      .where(
        and(
          eq(billingEvents.tenantId, tenantId),
          eq(billingEvents.status, "billable"),
          isNull(billingEvents.billingStatementId),
          gte(billingEvents.occurredAt, periodStart),
          lt(billingEvents.occurredAt, periodEnd),
        ),
      );

    return statement.id;
  });

  if (!chargeNow) {
    return {
      duplicate: false,
      statementId,
      status: "finalized",
      preview,
      charge: { status: "skipped", failureReason: null },
    };
  }

  const chargeResult = await chargeStatement({ db, statementId });
  await db.insert(chargeAttempts).values({
    billingStatementId: statementId,
    paymentGateway: "stripe",
    externalChargeId: chargeResult.chargeId,
    amountCents: preview.grandTotalCents,
    status: chargeResult.status,
    failureReason: chargeResult.failureReason,
  });

  if (chargeResult.status === "paid") {
    await db.transaction(async (tx) => {
      await tx
        .update(billingStatements)
        .set({ status: "paid", chargedAt: new Date() })
        .where(eq(billingStatements.id, statementId));
      await tx
        .update(billingEvents)
        .set({ status: "billed" })
        .where(eq(billingEvents.billingStatementId, statementId));
    });
    return {
      duplicate: false,
      statementId,
      status: "paid",
      preview,
      charge: { status: "paid", failureReason: null },
    };
  }

  await db
    .update(billingStatements)
    .set({ status: "payment_failed" })
    .where(eq(billingStatements.id, statementId));

  return {
    duplicate: false,
    statementId,
    status: "payment_failed",
    preview,
    charge: { status: "failed", failureReason: chargeResult.failureReason },
  };
}

export async function retryStatementCharge(params: {
  db: DbClient;
  statementId: string;
}): Promise<{ status: "paid" | "failed"; failureReason: string | null }> {
  const { db, statementId } = params;
  const [statement] = await db
    .select({
      id: billingStatements.id,
      grandTotalCents: billingStatements.grandTotalCents,
    })
    .from(billingStatements)
    .where(eq(billingStatements.id, statementId))
    .limit(1);
  if (!statement) throw new Error("statement_not_found");

  const chargeResult = await chargeStatement({ db, statementId });
  await db.insert(chargeAttempts).values({
    billingStatementId: statementId,
    paymentGateway: "stripe",
    externalChargeId: chargeResult.chargeId,
    amountCents: statement.grandTotalCents,
    status: chargeResult.status,
    failureReason: chargeResult.failureReason,
  });

  if (chargeResult.status === "paid") {
    await db.transaction(async (tx) => {
      await tx
        .update(billingStatements)
        .set({ status: "paid", chargedAt: new Date() })
        .where(eq(billingStatements.id, statementId));
      await tx
        .update(billingEvents)
        .set({ status: "billed" })
        .where(eq(billingEvents.billingStatementId, statementId));
    });
  } else {
    await db
      .update(billingStatements)
      .set({ status: "payment_failed" })
      .where(eq(billingStatements.id, statementId));
  }

  return {
    status: chargeResult.status,
    failureReason: chargeResult.failureReason,
  };
}


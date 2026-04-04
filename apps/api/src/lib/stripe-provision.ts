import { randomBytes, createHash } from "node:crypto";
import {
  DEFAULT_STRIPE_FALLBACK_LIMITS,
  hashWebhookIngressToken,
  limitsForBillingPlan,
  parseBillingPlanCode,
  type BillingPlanCode,
} from "@re/core";
import { eq, sql } from "drizzle-orm";
import { memberships, tenants, webhookIngressTokens, type DbClient } from "@re/db";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProvisionLimits = {
  planMonthlyEventsLimit: number | null;
  planMonthlyRecoveryLimit: number | null;
  /** Preenchido quando o checkout envia `re_plan` (ou equivalente) nos metadados. */
  billingPlan: BillingPlanCode | null;
};

function parsePositiveInt(raw: string | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Ordem: metadata `re_plan` (essential | growth | scale) → limites da LP;
 * depois `re_events_limit` / `re_recovery_limit` na Session ou no Price;
 * depois env `STRIPE_DEFAULT_PLAN_*`; fallback = tier Essencial (100 recuperações, 5000 eventos).
 */
export function resolveLimitsFromStripeSession(session: Stripe.Checkout.Session): ProvisionLimits {
  const md = session.metadata ?? {};

  let planCode =
    parseBillingPlanCode(md.re_plan ?? md.plan_tier ?? md.billing_plan) ?? null;
  if (!planCode) {
    const items = session.line_items?.data;
    const price = items?.[0]?.price;
    if (price && typeof price === "object" && "metadata" in price) {
      const pm = (price as Stripe.Price).metadata ?? {};
      planCode = parseBillingPlanCode(pm.re_plan ?? pm.plan_tier ?? pm.billing_plan) ?? null;
    }
  }
  if (planCode) {
    const L = limitsForBillingPlan(planCode);
    return {
      planMonthlyEventsLimit: L.planMonthlyEventsLimit,
      planMonthlyRecoveryLimit: L.planMonthlyRecoveryLimit,
      billingPlan: planCode,
    };
  }

  let events = parsePositiveInt(md.re_events_limit ?? md.plan_monthly_events_limit);
  let recovery = parsePositiveInt(md.re_recovery_limit ?? md.plan_monthly_recovery_limit);

  const items = session.line_items?.data;
  if (items?.length && (events == null || recovery == null)) {
    const price = items[0]?.price;
    if (price && typeof price === "object" && "metadata" in price) {
      const pm = (price as Stripe.Price).metadata ?? {};
      if (events == null) {
        events = parsePositiveInt(pm.re_events_limit ?? pm.plan_monthly_events_limit);
      }
      if (recovery == null) {
        recovery = parsePositiveInt(pm.re_recovery_limit ?? pm.plan_monthly_recovery_limit);
      }
    }
  }

  if (events == null) {
    const d = process.env.STRIPE_DEFAULT_PLAN_EVENTS_LIMIT?.trim();
    events = d ? parsePositiveInt(d) : DEFAULT_STRIPE_FALLBACK_LIMITS.planMonthlyEventsLimit;
  }
  if (recovery == null) {
    const d = process.env.STRIPE_DEFAULT_PLAN_RECOVERY_LIMIT?.trim();
    recovery = d ? parsePositiveInt(d) : DEFAULT_STRIPE_FALLBACK_LIMITS.planMonthlyRecoveryLimit;
  }

  return {
    planMonthlyEventsLimit: events,
    planMonthlyRecoveryLimit: recovery,
    billingPlan: null,
  };
}

async function authUserIdByEmail(db: DbClient, email: string): Promise<string | null> {
  const rows = await db.execute(
    sql`select id::text as id from auth.users where lower(email) = lower(${email}) limit 1`,
  );
  const row = rows[0] as { id?: string } | undefined;
  return row?.id ?? null;
}

function passwordSetupRedirectOptions() {
  const redirectTo = process.env.SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL?.trim();
  return redirectTo ? { redirectTo } : undefined;
}

async function sendPasswordSetupEmail(supabase: SupabaseClient, email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, passwordSetupRedirectOptions());
  if (error) throw error;
}

async function createAuthUser(supabase: SupabaseClient, email: string): Promise<string> {
  const password = `re-${randomBytes(18).toString("base64url")}`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { provisioned_via: "stripe_checkout" },
  });
  if (error) throw error;
  if (!data.user?.id) throw new Error("createUser_missing_id");
  return data.user.id;
}

async function getOrCreateAuthUserId(
  db: DbClient,
  supabase: SupabaseClient,
  email: string,
): Promise<{ userId: string; created: boolean }> {
  const existing = await authUserIdByEmail(db, email);
  if (existing) return { userId: existing, created: false };
  try {
    return { userId: await createAuthUser(supabase, email), created: true };
  } catch (e: unknown) {
    const msg =
      e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
    if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
      const again = await authUserIdByEmail(db, email);
      if (again) return { userId: again, created: false };
    }
    throw e;
  }
}

function advisoryLockExpr(sessionId: string) {
  const buf = createHash("sha256").update(sessionId, "utf8").digest();
  const k1 = buf.readInt32BE(0);
  const k2 = buf.readInt32BE(4);
  return sql`select pg_advisory_xact_lock(${k1}::int, ${k2}::int)`;
}

async function resolveCheckoutCustomerEmail(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const direct =
    session.customer_details?.email?.trim() ||
    session.customer_email?.trim() ||
    null;
  if (direct) return direct;

  const custRef = session.customer;
  if (typeof custRef === "string") {
    const c = await stripe.customers.retrieve(custRef);
    if (!c.deleted && "email" in c && typeof c.email === "string" && c.email.trim()) {
      return c.email.trim();
    }
  }
  return null;
}

async function resolveStripeBillingRefs(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<{ customerId: string | null; paymentMethodId: string | null }> {
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer && "id" in session.customer && typeof session.customer.id === "string"
        ? session.customer.id
        : null;

  let paymentMethodId: string | null = null;

  if (typeof session.payment_intent === "string") {
    const intent = await stripe.paymentIntents.retrieve(session.payment_intent);
    paymentMethodId =
      typeof intent.payment_method === "string"
        ? intent.payment_method
        : intent.payment_method && typeof intent.payment_method === "object" && "id" in intent.payment_method
          ? typeof intent.payment_method.id === "string"
            ? intent.payment_method.id
            : null
          : null;
  }

  if (!paymentMethodId && typeof session.subscription === "string") {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    paymentMethodId =
      typeof subscription.default_payment_method === "string"
        ? subscription.default_payment_method
        : subscription.default_payment_method &&
            typeof subscription.default_payment_method === "object" &&
            "id" in subscription.default_payment_method
          ? typeof subscription.default_payment_method.id === "string"
            ? subscription.default_payment_method.id
            : null
          : null;
  }

  if (!paymentMethodId && customerId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) {
      const fallbackPm = customer.invoice_settings.default_payment_method;
      paymentMethodId =
        typeof fallbackPm === "string"
          ? fallbackPm
          : fallbackPm && typeof fallbackPm === "object" && "id" in fallbackPm
            ? typeof fallbackPm.id === "string"
              ? fallbackPm.id
              : null
            : null;
    }
  }

  return { customerId, paymentMethodId };
}

export async function provisionStripeCheckoutSession(params: {
  db: DbClient;
  supabase: SupabaseClient;
  stripe: Stripe;
  session: Stripe.Checkout.Session;
}): Promise<{ tenantId: string; duplicate: boolean }> {
  const { db, supabase, stripe, session } = params;
  const sessionId = session.id;

  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.stripeCheckoutSessionId, sessionId))
    .limit(1);
  if (existing) {
    return { tenantId: existing.id, duplicate: true };
  }

  const email = await resolveCheckoutCustomerEmail(stripe, session);
  if (!email) {
    throw new Error("checkout_missing_customer_email");
  }

  const sm = session.metadata ?? {};
  const hasPlanOnSession = parseBillingPlanCode(sm.re_plan ?? sm.plan_tier ?? sm.billing_plan) != null;
  const hasBothNumsOnSession =
    parsePositiveInt(sm.re_events_limit ?? sm.plan_monthly_events_limit) != null &&
    parsePositiveInt(sm.re_recovery_limit ?? sm.plan_monthly_recovery_limit) != null;

  let fullSession = session;
  if (!hasBothNumsOnSession || !hasPlanOnSession) {
    try {
      fullSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items.data.price"],
      });
    } catch {
      fullSession = session;
    }
  }

  const limits = resolveLimitsFromStripeSession(fullSession);
  const billingRefs = await resolveStripeBillingRefs(stripe, fullSession);
  const tenantName =
    session.customer_details?.name?.trim() || email.split("@")[0] || "Cliente";

  const authUser = await getOrCreateAuthUserId(db, supabase, email);

  const provisioned = await db.transaction(async (tx) => {
    await tx.execute(advisoryLockExpr(sessionId));

    const [dup] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.stripeCheckoutSessionId, sessionId))
      .limit(1);
    if (dup) {
      return { tenantId: dup.id, duplicate: true };
    }

    const webhookToken = randomBytes(32).toString("hex");
    const tokenHash = hashWebhookIngressToken(webhookToken);

    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: tenantName,
        stripeCheckoutSessionId: sessionId,
        stripeCustomerId: billingRefs.customerId,
        stripeDefaultPaymentMethodId: billingRefs.paymentMethodId,
        planMonthlyEventsLimit: limits.planMonthlyEventsLimit,
        planMonthlyRecoveryLimit: limits.planMonthlyRecoveryLimit,
        billingPlan: limits.billingPlan,
        recoveryContactCooldownMinutes: 180,
        recoveryContactMaxAttemptsPerDay: 3,
      })
      .returning({ id: tenants.id });

    if (!tenant) throw new Error("tenant_insert_failed");

    await tx.insert(memberships).values({
      tenantId: tenant.id,
      userId: authUser.userId,
      role: "owner",
    });

    await tx.insert(webhookIngressTokens).values({
      tenantId: tenant.id,
      tokenHash,
    });

    return { tenantId: tenant.id, duplicate: false };
  });

  if (!provisioned.duplicate && authUser.created) {
    await sendPasswordSetupEmail(supabase, email);
  }

  return provisioned;
}

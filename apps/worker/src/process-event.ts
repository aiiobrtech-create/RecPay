import { and, eq, gte, inArray } from "drizzle-orm";
import { isRecoverySalesTriggerEventType, TemplateContentGenerator } from "@re/core";
import { billingEvents, events, recoveryAttempts, sql, tenants, type DbClient } from "@re/db";
import { sendEvolutionMessage } from "@re/integrations";
import {
  buildMessageContext,
  ensurePendingMessageApproval,
  loadMessageApprovalForAttempt,
  maybeRecordConversionAttribution,
  readStoredMessaging,
  resolveRecoveryCheckoutLink,
  resolveMessagingConfig,
  type StoredMessagingMeta,
} from "./recovery-messaging.js";

/**
 * Processa um evento enfileirado (normalização + motor de decisão virão depois).
 */
type PaymentOutcome = "failed" | "pending" | "approved" | "unknown";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

async function maybeCreateBillingEvent(
  db: DbClient,
  row: typeof events.$inferSelect,
  canonical: Record<string, unknown>,
): Promise<void> {
  const eventType = readCanonicalEventType(canonical);
  if (eventType !== "payment_approved") return;

  const order = canonicalOrder(canonical);
  const customer = canonicalCustomer(canonical);
  const externalReference =
    pickString(order, ["externalId", "id", "orderId", "order_id"]) ?? row.id;
  const recoveredAmountCents = centsFromAmount(
    pickNumber(order, ["amountCents", "amount", "value", "total"]),
  );
  if (recoveredAmountCents <= 0) return;

  const [tenant] = await db
    .select({ successFeeBps: tenants.successFeeBps })
    .from(tenants)
    .where(eq(tenants.id, row.tenantId))
    .limit(1);
  const commissionRateBps = tenant?.successFeeBps ?? 500;
  const occurredAtRaw = canonical.occurredAt;
  const occurredAt =
    typeof occurredAtRaw === "string" && !Number.isNaN(new Date(occurredAtRaw).getTime())
      ? new Date(occurredAtRaw)
      : row.createdAt;

  await db
    .insert(billingEvents)
    .values({
      tenantId: row.tenantId,
      sourceEventId: row.id,
      externalReference,
      debtorReference:
        pickString(customer, ["externalId", "id", "email", "phone", "phoneE164", "phone_e164"]) ??
        null,
      recoveredAmountCents,
      currency: pickString(order, ["currency", "currency_code"]) ?? "BRL",
      occurredAt,
      commissionRateBps,
      commissionAmountCents: Math.round((recoveredAmountCents * commissionRateBps) / 10_000),
      status: "billable",
    })
    .onConflictDoNothing({
      target: [billingEvents.tenantId, billingEvents.externalReference],
    });
}

function centsFromAmount(amount: number | undefined): number {
  if (amount === undefined || !Number.isFinite(amount)) return 0;
  // Se já estiver em centavos (valor inteiro alto), mantemos; caso contrário convertemos de decimal.
  if (Number.isInteger(amount) && Math.abs(amount) >= 1000) return Math.trunc(amount);
  return Math.round(amount * 100);
}

function inferOutcome(statusRaw: string | undefined): PaymentOutcome {
  const status = statusRaw?.toLowerCase() ?? "";
  if (!status) return "unknown";

  if (
    ["failed", "declined", "rejected", "canceled", "cancelled", "chargeback", "refunded"].some((s) =>
      status.includes(s),
    )
  ) {
    return "failed";
  }
  if (["approved", "paid", "authorized", "succeeded", "success"].some((s) => status.includes(s))) {
    return "approved";
  }
  if (
    ["pending", "waiting", "processing", "in_analysis", "in_analysis", "open", "created"].some((s) =>
      status.includes(s),
    )
  ) {
    return "pending";
  }
  return "unknown";
}

function inferEventType(outcome: PaymentOutcome): "payment_failed" | "payment_approved" | "payment_pending" | "unknown" {
  if (outcome === "failed") return "payment_failed";
  if (outcome === "approved") return "payment_approved";
  if (outcome === "pending") return "payment_pending";
  return "unknown";
}

function normalizeCanonical(row: (typeof events.$inferSelect)): Record<string, unknown> {
  const payload = asObject(row.payload);
  const customer = asObject(payload.customer);
  const order = asObject(payload.order);
  const payment = asObject(payload.payment);

  const statusRaw =
    pickString(payload, ["status", "event", "event_type"]) ??
    pickString(payment, ["status", "outcome"]) ??
    pickString(order, ["status"]);

  const outcome = inferOutcome(statusRaw);
  const eventType = inferEventType(outcome);
  const amountRaw =
    pickNumber(order, ["amountCents", "amount", "value", "total"]) ??
    pickNumber(payload, ["amountCents", "amount", "value", "total"]);

  return {
    pipeline: "v1-generic",
    provider: row.provider,
    eventType,
    processedAt: new Date().toISOString(),
    payment: {
      outcome,
      statusRaw: statusRaw ?? null,
    },
    customer: {
      externalId: pickString(customer, ["id", "externalId", "external_id"]) ?? null,
      email: pickString(customer, ["email"]) ?? null,
      phone: pickString(customer, ["phone", "phoneE164", "phone_e164"]) ?? null,
      name: pickString(customer, ["name"]) ?? null,
    },
    order: {
      externalId:
        pickString(order, ["id", "externalId", "external_id", "orderId", "order_id"]) ??
        pickString(payload, ["orderId", "order_id"]) ??
        null,
      amountCents: centsFromAmount(amountRaw),
      currency:
        pickString(order, ["currency", "currency_code"]) ??
        pickString(payload, ["currency", "currency_code"]) ??
        "BRL",
    },
    rawRef: {
      payloadHash: row.payloadHash ?? null,
    },
  };
}

function readCanonicalEventType(canonical: Record<string, unknown>): string {
  const raw = canonical.eventType;
  return typeof raw === "string" ? raw : "unknown";
}

/** Mantém códigos antigos para payment_failed; demais gatilhos usam sufixo explícito. */
function recoveryScheduledReasonCode(eventType: string): string {
  if (eventType === "payment_failed") return "payment_failed_auto_recovery_v1";
  return `${eventType}_whatsapp_recovery_scheduled_v1`;
}

function recoverySimulatedReasonCode(eventType: string): string {
  if (eventType === "payment_failed") return "payment_failed_auto_recovery_simulated";
  return `${eventType}_whatsapp_recovery_simulated_v1`;
}

function recoverySentOkReasonCode(eventType: string): string {
  if (eventType === "payment_failed") return "payment_failed_auto_recovery_v1";
  return `${eventType}_whatsapp_recovery_sent_v1`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length <= 4) return "***";
  return `${"*".repeat(Math.max(digits.length - 4, 3))}${digits.slice(-4)}`;
}

function canonicalCustomer(canonical: Record<string, unknown>): Record<string, unknown> {
  return asObject(canonical.customer);
}

function canonicalOrder(canonical: Record<string, unknown>): Record<string, unknown> {
  return asObject(canonical.order);
}

function recoveryChannelMode(): "simulated" | "evolution" {
  const raw = process.env.RECOVERY_CHANNEL_MODE?.trim().toLowerCase();
  if (raw === "evolution") return "evolution";
  return "simulated";
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function recoveryContactCooldownMinutes(): number {
  return envInt("RECOVERY_CONTACT_COOLDOWN_MINUTES", 180, 1, 10_080);
}

function recoveryContactMaxAttemptsPerDay(): number {
  return envInt("RECOVERY_CONTACT_MAX_ATTEMPTS_PER_DAY", 3, 1, 20);
}

function tenantOrDefaultInt(
  tenantValue: number | null | undefined,
  fallback: () => number,
  min: number,
  max: number,
): number {
  if (typeof tenantValue !== "number" || !Number.isFinite(tenantValue)) return fallback();
  return Math.min(max, Math.max(min, Math.trunc(tenantValue)));
}

function phoneToContactKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 10) return null;
  return `phone:${digits}`;
}

function startOfCurrentUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

type MessagingPayload = {
  flowId: string | null;
  templateId: string | null;
  variantId: string | null;
  composedBody: string;
  approvalMode: "auto" | "requires_approval";
  contentGeneratorId: string;
  complianceFlags: string[];
};

type RecoveryLinkMeta = {
  id: string | null;
  url: string | null;
  source: "event" | "manual" | "none";
  platform: string | null;
  triggerEventType: string | null;
  productName: string | null;
};

function buildMessagingPayload(
  stored: StoredMessagingMeta | null,
  fresh: MessagingPayload,
): MessagingPayload {
  if (stored?.composedBody) {
    return {
      flowId: stored.flowId ?? null,
      templateId: stored.templateId ?? null,
      variantId: stored.variantId ?? null,
      composedBody: stored.composedBody,
      approvalMode: stored.approvalMode ?? "auto",
      contentGeneratorId: stored.contentGeneratorId ?? "template_v1",
      complianceFlags: stored.complianceFlags ?? [],
    };
  }
  return fresh;
}

async function maybeCreateRecoveryAttempt(
  db: DbClient,
  row: typeof events.$inferSelect,
  canonical: Record<string, unknown>,
): Promise<void> {
  const eventType = readCanonicalEventType(canonical);
  if (!isRecoverySalesTriggerEventType(eventType)) return;

  const [existingForEvent] = await db
    .select()
    .from(recoveryAttempts)
    .where(eq(recoveryAttempts.eventId, row.id))
    .limit(1);

  if (existingForEvent && existingForEvent.status !== "scheduled") return;
  const retryMeta =
    existingForEvent && existingForEvent.meta && typeof existingForEvent.meta === "object" && !Array.isArray(existingForEvent.meta)
      ? ((existingForEvent.meta as Record<string, unknown>).retry as Record<string, unknown> | null | undefined)
      : null;
  const retryOrigin = typeof retryMeta?.origin === "string" ? retryMeta.origin : "";
  const isManualRetry = retryOrigin.includes("manual");

  const generator = new TemplateContentGenerator();
  const resolved = await resolveMessagingConfig(db, row.tenantId, eventType);
  const recoveryLink = await resolveRecoveryCheckoutLink(db, row.tenantId, canonical, eventType);
  const composed = generator.compose(
    resolved.templateBody,
    buildMessageContext(canonical, eventType, {
      checkoutLinkOverride: recoveryLink.url,
    }),
  );
  const messagingPayload = buildMessagingPayload(readStoredMessaging(existingForEvent?.meta), {
    flowId: resolved.flowId,
    templateId: resolved.templateId,
    variantId: resolved.variantId,
    composedBody: composed.body,
    approvalMode: resolved.approvalMode,
    contentGeneratorId: generator.id,
    complianceFlags: composed.complianceFlags,
  });

  const [tenant] = await db
    .select({
      id: tenants.id,
      planMonthlyRecoveryLimit: tenants.planMonthlyRecoveryLimit,
      recoveryContactCooldownMinutes: tenants.recoveryContactCooldownMinutes,
      recoveryContactMaxAttemptsPerDay: tenants.recoveryContactMaxAttemptsPerDay,
      recoveryChannelMode: tenants.recoveryChannelMode,
    })
    .from(tenants)
    .where(eq(tenants.id, row.tenantId))
    .limit(1);

  if (!isManualRetry && tenant?.planMonthlyRecoveryLimit && tenant.planMonthlyRecoveryLimit > 0) {
    const monthStart = startOfCurrentUtcMonth();
    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(recoveryAttempts)
      .where(
        and(
          eq(recoveryAttempts.tenantId, row.tenantId),
          gte(recoveryAttempts.createdAt, monthStart),
        ),
      );
    const total = countRow?.total ?? 0;

    if (total >= tenant.planMonthlyRecoveryLimit) {
      await db
        .insert(recoveryAttempts)
        .values({
          tenantId: row.tenantId,
          eventId: row.id,
          channel: "whatsapp",
          status: "failed",
          reason: "tenant_monthly_recovery_limit_exceeded",
          executedAt: new Date(),
          meta: {
            provider: row.provider,
            eventType,
            limit: tenant.planMonthlyRecoveryLimit,
            monthStart: monthStart.toISOString(),
          },
        })
        .onConflictDoNothing({
          target: [recoveryAttempts.eventId],
        });
      return;
    }
  }

  const [created] = await db
    .insert(recoveryAttempts)
    .values({
      tenantId: row.tenantId,
      eventId: row.id,
      channel: "whatsapp",
      status: "scheduled",
      reason: recoveryScheduledReasonCode(eventType),
      meta: {
        provider: row.provider,
        eventType,
        recoveryLink,
        messaging: messagingPayload,
      },
    })
    .onConflictDoNothing({
      target: [recoveryAttempts.eventId],
    })
    .returning({ id: recoveryAttempts.id });

  let attemptId = created?.id ?? null;
  if (!attemptId) {
    const [existing] = await db.select().from(recoveryAttempts).where(eq(recoveryAttempts.eventId, row.id)).limit(1);
    if (!existing || existing.status !== "scheduled") return;
    attemptId = existing.id;
    if (!readStoredMessaging(existing.meta)?.composedBody) {
      const prevMeta =
        existing.meta && typeof existing.meta === "object" && !Array.isArray(existing.meta)
          ? (existing.meta as Record<string, unknown>)
          : {};
      await db
        .update(recoveryAttempts)
        .set({
          meta: {
            ...prevMeta,
            provider: row.provider,
            eventType,
            recoveryLink,
            messaging: messagingPayload,
          },
        })
        .where(eq(recoveryAttempts.id, attemptId));
    }
  }

  const customer = canonicalCustomer(canonical);
  const phone =
    pickString(customer, ["phone"]) ??
    pickString(customer, ["phoneE164"]) ??
    pickString(customer, ["phone_e164"]);
  const contactKey = phoneToContactKey(phone);

  const buildMeta = (
    ck: string | null | undefined,
    recoveryLinkMeta: RecoveryLinkMeta,
    extra: Record<string, unknown> = {},
  ) => ({
    provider: row.provider,
    eventType,
    contactKey: ck ?? null,
    recoveryLink: recoveryLinkMeta,
    messaging: messagingPayload,
    ...extra,
  });

  if (!phone) {
    await db
      .update(recoveryAttempts)
      .set({
        status: "failed",
        reason: "missing_customer_phone",
        executedAt: new Date(),
        meta: buildMeta(contactKey, recoveryLink, {
        delivery: {
          provider: "evolution",
          ok: false,
          errorCode: "missing_customer_phone",
          errorMessage: "Número do cliente ausente.",
        },
      }),
      })
      .where(eq(recoveryAttempts.id, attemptId));
    return;
  }

  if (!contactKey) {
    await db
      .update(recoveryAttempts)
      .set({
        status: "failed",
        reason: "invalid_customer_phone",
        executedAt: new Date(),
        meta: buildMeta(null, recoveryLink, {
        delivery: {
          provider: "evolution",
          ok: false,
          errorCode: "invalid_customer_phone",
          errorMessage: "Número do cliente inválido.",
        },
      }),
      })
      .where(eq(recoveryAttempts.id, attemptId));
    return;
  }

  await db
    .update(recoveryAttempts)
    .set({
      meta: buildMeta(contactKey, recoveryLink),
    })
    .where(eq(recoveryAttempts.id, attemptId));

  if (messagingPayload.approvalMode === "requires_approval") {
    const approval = await loadMessageApprovalForAttempt(db, attemptId);
    if (!approval) {
      await ensurePendingMessageApproval(db, row.tenantId, attemptId, messagingPayload.composedBody);
      await db
        .update(recoveryAttempts)
        .set({
          reason: "awaiting_message_approval",
          meta: buildMeta(contactKey, recoveryLink),
        })
        .where(eq(recoveryAttempts.id, attemptId));
      return;
    }
    if (approval.status === "pending") {
      await db
        .update(recoveryAttempts)
        .set({
          meta: buildMeta(contactKey, recoveryLink),
        })
        .where(eq(recoveryAttempts.id, attemptId));
      return;
    }
    if (approval.status === "rejected") {
      await db
        .update(recoveryAttempts)
        .set({
          status: "failed",
          reason: "message_rejected_by_reviewer",
          executedAt: new Date(),
          meta: buildMeta(contactKey, recoveryLink, {
            review: {
              reviewerNote: approval.reviewerNote ?? null,
              resolvedBy: approval.resolvedBy ?? null,
            },
          }),
        })
        .where(eq(recoveryAttempts.id, attemptId));
      return;
    }
  }

  const cooldownMinutes = tenantOrDefaultInt(
    tenant?.recoveryContactCooldownMinutes,
    recoveryContactCooldownMinutes,
    1,
    10_080,
  );
  const cooldownStart = new Date(Date.now() - cooldownMinutes * 60_000);
  const [cooldownWindow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      lastCreatedAt: sql<string | null>`max(${recoveryAttempts.createdAt})::text`,
    })
    .from(recoveryAttempts)
    .where(
      and(
        eq(recoveryAttempts.tenantId, row.tenantId),
        eq(recoveryAttempts.channel, "whatsapp"),
        gte(recoveryAttempts.createdAt, cooldownStart),
        inArray(recoveryAttempts.status, ["scheduled", "simulated_sent", "sent"]),
        sql`${recoveryAttempts.id} <> ${attemptId}`,
        sql`${recoveryAttempts.meta} ->> 'contactKey' = ${contactKey}`,
      ),
    );

  if (!isManualRetry && (cooldownWindow?.total ?? 0) > 0) {
    await db
      .update(recoveryAttempts)
      .set({
        status: "failed",
        reason: "contact_cooldown_active",
        executedAt: new Date(),
        meta: buildMeta(contactKey, recoveryLink, {
          throttling: {
            reason: "cooldown",
            cooldownMinutes,
            windowStart: cooldownStart.toISOString(),
            lastAttemptAt: cooldownWindow?.lastCreatedAt ?? null,
          },
        }),
      })
      .where(eq(recoveryAttempts.id, attemptId));
    return;
  }

  const maxAttemptsPerDay = tenantOrDefaultInt(
    tenant?.recoveryContactMaxAttemptsPerDay,
    recoveryContactMaxAttemptsPerDay,
    1,
    20,
  );
  const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [dailyWindow] = await db
    .select({
      total: sql<number>`count(*)::int`,
    })
    .from(recoveryAttempts)
    .where(
      and(
        eq(recoveryAttempts.tenantId, row.tenantId),
        eq(recoveryAttempts.channel, "whatsapp"),
        gte(recoveryAttempts.createdAt, dayStart),
        inArray(recoveryAttempts.status, ["scheduled", "simulated_sent", "sent"]),
        sql`${recoveryAttempts.id} <> ${attemptId}`,
        sql`${recoveryAttempts.meta} ->> 'contactKey' = ${contactKey}`,
      ),
    );

  if (!isManualRetry && (dailyWindow?.total ?? 0) >= maxAttemptsPerDay) {
    await db
      .update(recoveryAttempts)
      .set({
        status: "failed",
        reason: "contact_daily_limit_exceeded",
        executedAt: new Date(),
        meta: buildMeta(contactKey, recoveryLink, {
          throttling: {
            reason: "daily_limit",
            maxAttemptsPerDay,
            windowStart: dayStart.toISOString(),
            totalAttempts: dailyWindow?.total ?? 0,
          },
        }),
      })
      .where(eq(recoveryAttempts.id, attemptId));
    return;
  }

  const mode =
    tenant?.recoveryChannelMode === "evolution" || tenant?.recoveryChannelMode === "simulated"
      ? tenant.recoveryChannelMode
      : recoveryChannelMode();
  if (mode === "simulated") {
    await db
      .update(recoveryAttempts)
      .set({
        status: "simulated_sent",
        reason: recoverySimulatedReasonCode(eventType),
        executedAt: new Date(),
        meta: buildMeta(contactKey, recoveryLink, {
          delivery: {
            provider: "simulated",
            ok: true,
            mode: "simulated",
          },
        }),
      })
      .where(eq(recoveryAttempts.id, attemptId));
    return;
  }

  const sendResult = await sendEvolutionMessage({
    to: phone,
    text: messagingPayload.composedBody,
    requestId: row.id,
  });

  await db
    .update(recoveryAttempts)
    .set({
      status: sendResult.ok ? "sent" : "failed",
      reason: sendResult.ok ? recoverySentOkReasonCode(eventType) : sendResult.errorCode ?? "send_error",
      executedAt: new Date(),
      meta: buildMeta(contactKey, recoveryLink, {
        delivery: {
          provider: "evolution",
          ok: sendResult.ok,
          statusCode: sendResult.statusCode ?? null,
          providerMessageId: sendResult.providerMessageId ?? null,
          errorCode: sendResult.errorCode ?? null,
          errorMessage: sendResult.errorMessage ?? null,
          errorType: sendResult.errorType ?? null,
        },
      }),
    })
    .where(eq(recoveryAttempts.id, attemptId));

  console.info(
    JSON.stringify({
      scope: "recovery",
      action: "attempt_dispatched",
      tenantId: row.tenantId,
      eventId: row.id,
      attemptId,
      eventType,
      channel: "whatsapp",
      provider: "evolution",
      ok: sendResult.ok,
      errorCode: sendResult.errorCode ?? null,
      targetPhoneMasked: maskPhone(phone),
    }),
  );
}

export async function processEventById(db: DbClient, eventId: string): Promise<void> {
  const [row] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!row) return;
  if (row.status === "failed") return;

  const canFinalizeEvent = row.status === "queued" || row.status === "received";
  if (!canFinalizeEvent && row.status !== "processed") return;

  try {
    const canonical =
      row.canonical && typeof row.canonical === "object" && !Array.isArray(row.canonical)
        ? (row.canonical as Record<string, unknown>)
        : normalizeCanonical(row);
    await maybeCreateBillingEvent(db, row, canonical);
    const canonicalEventType = readCanonicalEventType(canonical);
    if (canonicalEventType === "payment_approved") {
      await maybeRecordConversionAttribution(
        db,
        { id: row.id, tenantId: row.tenantId, createdAt: row.createdAt },
        canonical,
      );
    }
    await maybeCreateRecoveryAttempt(db, row, canonical);
    if (canFinalizeEvent) {
      await db
        .update(events)
        .set({
          status: "processed",
          canonical,
        })
        .where(and(eq(events.id, eventId), inArray(events.status, ["queued", "received"])));
    }
  } catch {
    if (canFinalizeEvent) {
      await db.update(events).set({ status: "failed" }).where(eq(events.id, eventId));
    }
  }
}

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  type ConversionTriggerEventType,
  type MessageCompositionContext,
  TemplateContentGenerator,
  defaultRecoveryTemplatePt,
  isConversionTriggerEventType,
  isWithinAttributionWindow,
} from "@re/core";
import {
  conversionAttributions,
  messageApprovals,
  messageTemplates,
  messageVariants,
  recoveryAttempts,
  recoveryFlows,
  type DbClient,
} from "@re/db";

export { TemplateContentGenerator, defaultRecoveryTemplatePt };

export type ResolvedMessagingConfig = {
  flowId: string | null;
  templateId: string | null;
  variantId: string | null;
  templateBody: string;
  approvalMode: "auto" | "requires_approval";
};

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

export function pickWeightedVariant<T extends { id: string; weight: number }>(items: T[]): T | null {
  if (!items.length) return null;
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return items[0] ?? null;
  let r = Math.random() * total;
  for (const item of items) {
    r -= Math.max(0, item.weight);
    if (r <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}

export async function selectRecoveryFlow(db: DbClient, tenantId: string, triggerEventType: string) {
  const rows = await db
    .select()
    .from(recoveryFlows)
    .where(
      and(
        eq(recoveryFlows.tenantId, tenantId),
        eq(recoveryFlows.triggerEventType, triggerEventType),
        eq(recoveryFlows.enabled, true),
        eq(recoveryFlows.channel, "whatsapp"),
      ),
    )
    .orderBy(desc(recoveryFlows.priority))
    .limit(1);
  return rows[0] ?? null;
}

export async function resolveMessagingConfig(
  db: DbClient,
  tenantId: string,
  triggerEventType: string,
): Promise<ResolvedMessagingConfig> {
  const flow = await selectRecoveryFlow(db, tenantId, triggerEventType);
  if (!flow) {
    return {
      flowId: null,
      templateId: null,
      variantId: null,
      templateBody: defaultRecoveryTemplatePt(),
      approvalMode: "auto",
    };
  }

  const [template] = await db
    .select()
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.id, flow.messageTemplateId),
        eq(messageTemplates.tenantId, tenantId),
        eq(messageTemplates.active, true),
      ),
    )
    .limit(1);

  if (!template) {
    return {
      flowId: flow.id,
      templateId: flow.messageTemplateId,
      variantId: null,
      templateBody: defaultRecoveryTemplatePt(),
      approvalMode: flow.approvalMode,
    };
  }

  const variants = await db
    .select()
    .from(messageVariants)
    .where(
      and(
        eq(messageVariants.templateId, template.id),
        eq(messageVariants.tenantId, tenantId),
        eq(messageVariants.active, true),
      ),
    );

  const picked = pickWeightedVariant(variants.map((v) => ({ id: v.id, weight: v.weight })));
  const variantRow = picked ? variants.find((v) => v.id === picked.id) ?? null : null;
  const body = variantRow?.body?.trim() ? variantRow.body : template.body;

  return {
    flowId: flow.id,
    templateId: template.id,
    variantId: variantRow?.id ?? null,
    templateBody: body,
    approvalMode: flow.approvalMode,
  };
}

export function buildMessageContext(
  canonical: Record<string, unknown>,
  trigger: string,
): MessageCompositionContext {
  const safeTrigger: ConversionTriggerEventType = isConversionTriggerEventType(trigger)
    ? trigger
    : "unknown";
  const customer = asObject(canonical.customer);
  const order = asObject(canonical.order);
  const name = pickString(customer, ["name"]) ?? "cliente";
  const amountCents = pickNumber(order, ["amountCents"]) ?? 0;
  const currency = pickString(order, ["currency"]) ?? "BRL";
  const amountFormatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
  const checkoutLink =
    pickString(order, ["checkoutUrl", "checkout_url", "paymentLink", "payment_link"]) ?? null;
  const orderRef =
    pickString(order, ["externalId", "external_id", "orderId", "order_id"]) ?? null;

  return {
    trigger: safeTrigger,
    customerName: name,
    amountFormatted,
    currency,
    checkoutLink,
    orderRef,
  };
}

export type StoredMessagingMeta = {
  flowId?: string | null;
  templateId?: string | null;
  variantId?: string | null;
  composedBody?: string;
  approvalMode?: "auto" | "requires_approval";
  contentGeneratorId?: string;
  complianceFlags?: string[];
};

export function readStoredMessaging(meta: unknown): StoredMessagingMeta | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const raw = (meta as Record<string, unknown>).messaging;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as StoredMessagingMeta;
}

export async function ensurePendingMessageApproval(
  db: DbClient,
  tenantId: string,
  recoveryAttemptId: string,
  composedBody: string,
): Promise<"inserted" | "exists"> {
  const [existing] = await db
    .select({ id: messageApprovals.id })
    .from(messageApprovals)
    .where(eq(messageApprovals.recoveryAttemptId, recoveryAttemptId))
    .limit(1);
  if (existing) return "exists";
  await db.insert(messageApprovals).values({
    tenantId,
    recoveryAttemptId,
    composedBody,
    status: "pending",
  });
  return "inserted";
}

export async function loadMessageApprovalForAttempt(db: DbClient, recoveryAttemptId: string) {
  const [row] = await db
    .select()
    .from(messageApprovals)
    .where(eq(messageApprovals.recoveryAttemptId, recoveryAttemptId))
    .limit(1);
  return row ?? null;
}

/**
 * Quando chega um evento de pagamento aprovado, atribui à tentativa de recuperação mais recente
 * do mesmo contato dentro da janela (foco: pagamento aprovado como conversão).
 */
export async function maybeRecordConversionAttribution(
  db: DbClient,
  eventRow: { id: string; tenantId: string; createdAt: Date },
  canonical: Record<string, unknown>,
): Promise<void> {
  const customer = asObject(canonical.customer);
  const phone =
    pickString(customer, ["phone"]) ??
    pickString(customer, ["phoneE164"]) ??
    pickString(customer, ["phone_e164"]);
  const digits = phone?.replace(/[^\d]/g, "") ?? "";
  if (digits.length < 10) return;
  const contactKey = `phone:${digits}`;

  const [latestAttempt] = await db
    .select()
    .from(recoveryAttempts)
    .where(
      and(
        eq(recoveryAttempts.tenantId, eventRow.tenantId),
        inArray(recoveryAttempts.status, ["sent", "simulated_sent"]),
        lte(recoveryAttempts.createdAt, eventRow.createdAt),
        sql`${recoveryAttempts.meta}->>'contactKey' = ${contactKey}`,
      ),
    )
    .orderBy(desc(recoveryAttempts.createdAt))
    .limit(1);

  if (!latestAttempt) return;

  if (
    !isWithinAttributionWindow({
      attemptCreatedAt: latestAttempt.createdAt,
      conversionEventCreatedAt: eventRow.createdAt,
    })
  ) {
    return;
  }

  await db
    .insert(conversionAttributions)
    .values({
      tenantId: eventRow.tenantId,
      recoveryAttemptId: latestAttempt.id,
      conversionEventId: eventRow.id,
    })
    .onConflictDoNothing({ target: [conversionAttributions.recoveryAttemptId] });
}

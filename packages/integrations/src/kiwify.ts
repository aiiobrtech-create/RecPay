import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import type { CanonicalEvent, PaymentOutcome } from "@re/core";

const KIWIFY_PENDING_EVENTS = new Set(["boleto_gerado", "pix_gerado", "subscription_late"]);
const KIWIFY_APPROVED_EVENTS = new Set(["compra_aprovada", "subscription_renewed"]);
const KIWIFY_FAILED_EVENTS = new Set(["compra_recusada", "compra_reembolsada", "chargeback", "subscription_canceled"]);
const KIWIFY_KNOWN_EVENTS = new Set([
  ...KIWIFY_PENDING_EVENTS,
  ...KIWIFY_APPROVED_EVENTS,
  ...KIWIFY_FAILED_EVENTS,
  "carrinho_abandonado",
]);

const kiwifyPayloadSchema = z
  .object({
    event: z.string().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    order_id: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    payment_status: z.string().optional(),
    amount: z.union([z.number(), z.string()]).optional(),
    amount_cents: z.union([z.number(), z.string()]).optional(),
    currency: z.string().optional(),
    customer: z.record(z.unknown()).optional(),
    order: z.record(z.unknown()).optional(),
  })
  .passthrough();

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
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

function inferOutcome(rawStatus: string | undefined): PaymentOutcome {
  const status = rawStatus?.toLowerCase() ?? "";
  if (!status) return "unknown";
  if (KIWIFY_APPROVED_EVENTS.has(status)) return "approved";
  if (KIWIFY_PENDING_EVENTS.has(status)) return "pending";
  if (KIWIFY_FAILED_EVENTS.has(status)) return "failed";
  if (["paid", "approved", "completed", "authorized", "success"].some((s) => status.includes(s))) {
    return "approved";
  }
  if (["pending", "waiting", "processing", "open"].some((s) => status.includes(s))) {
    return "pending";
  }
  if (["failed", "refused", "refunded", "chargeback", "canceled", "cancelled", "expired"].some((s) => status.includes(s))) {
    return "failed";
  }
  return "unknown";
}

export function looksLikeKiwifyPayload(payload: unknown): boolean {
  const root = asObject(payload);
  const order = asObject(root.order);
  const event = pickString(root, ["event"])?.toLowerCase();

  if (event && (KIWIFY_KNOWN_EVENTS.has(event) || event.startsWith("order."))) {
    return true;
  }

  return Boolean(
    pickString(root, ["order_id", "transaction_id", "id"]) ||
      pickString(order, ["id", "order_id"]) ||
      pickString(root, ["payment_status", "status"]) ||
      pickString(order, ["payment_status", "status"]),
  );
}

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyKiwifyWebhook(
  headers: IncomingHttpHeaders,
  body: unknown,
  credentials?: { token?: string | null; secret?: string | null },
): { ok: true } | { ok: false; reason: string } {
  const token = credentials?.token?.trim() || process.env.KIWIFY_WEBHOOK_TOKEN?.trim();
  const secret = credentials?.secret?.trim() || process.env.KIWIFY_WEBHOOK_SECRET?.trim();

  if (!token && !secret) {
    return { ok: false, reason: "kiwify_signature_not_configured" };
  }

  if (token) {
    const headerRaw = headers["x-kiwify-token"] ?? headers["x-kiwify-webhook-token"];
    const provided = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
    if (typeof provided !== "string" || !provided.trim()) {
      return { ok: false, reason: "kiwify_token_missing" };
    }
    if (!safeEq(provided.trim(), token)) {
      return { ok: false, reason: "kiwify_token_invalid" };
    }
    return { ok: true };
  }

  const signatureRaw = headers["x-kiwify-signature"];
  const providedSig = Array.isArray(signatureRaw) ? signatureRaw[0] : signatureRaw;
  if (typeof providedSig !== "string" || !providedSig.trim()) {
    return { ok: false, reason: "kiwify_signature_missing" };
  }

  const computed = createHmac("sha256", secret ?? "")
    .update(JSON.stringify(body ?? {}), "utf8")
    .digest("hex");

  if (!safeEq(providedSig.trim().toLowerCase(), computed.toLowerCase())) {
    return { ok: false, reason: "kiwify_signature_invalid" };
  }
  return { ok: true };
}

export function parseKiwifyToCanonical(params: {
  tenantId: string;
  idempotencyKey: string;
  payloadHash: string;
  payload: unknown;
}): CanonicalEvent | null {
  const parsed = kiwifyPayloadSchema.safeParse(params.payload);
  if (!parsed.success) return null;

  const root = asObject(parsed.data);
  const order = asObject(root.order);
  const customer = asObject(root.customer);

  const rawStatus =
    pickString(root, ["event", "payment_status", "status"]) ??
    pickString(order, ["status", "payment_status"]);
  const outcome = inferOutcome(rawStatus);
  const amountRaw =
    pickNumber(root, ["amount_cents", "amount"]) ??
    pickNumber(order, ["amount_cents", "amount", "total"]);
  const amountCents =
    amountRaw === undefined ? 0 : Number.isInteger(amountRaw) && Math.abs(amountRaw) >= 1000 ? Math.trunc(amountRaw) : Math.round(amountRaw * 100);

  return {
    idempotencyKey: params.idempotencyKey,
    tenantId: params.tenantId,
    integration: "kiwify",
    occurredAt: new Date().toISOString(),
    customer: {
      externalId: pickString(customer, ["id", "external_id", "document"]) ?? "unknown",
      email: pickString(customer, ["email"]),
      phoneE164: pickString(customer, ["phone", "phone_number"]),
      name: pickString(customer, ["name"]),
    },
    order: {
      externalId:
        pickString(root, ["order_id", "transaction_id"]) ??
        pickString(root, ["id"]) ??
        pickString(order, ["id", "order_id"]) ??
        params.idempotencyKey,
      amountCents,
      currency: pickString(root, ["currency"]) ?? pickString(order, ["currency"]) ?? "BRL",
      productName: pickString(order, ["product_name", "name"]),
    },
    payment: { outcome },
    rawRef: { provider: "kiwify", payloadHash: params.payloadHash },
  };
}

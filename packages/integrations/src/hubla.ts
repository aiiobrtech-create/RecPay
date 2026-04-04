import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import type { CanonicalEvent, PaymentOutcome } from "@re/core";

const hublaPayloadSchema = z
  .object({
    event: z.string().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    payment_status: z.string().optional(),
    amount: z.union([z.number(), z.string()]).optional(),
    amount_cents: z.union([z.number(), z.string()]).optional(),
    currency: z.string().optional(),
    customer: z.record(z.unknown()).optional(),
    order: z.record(z.unknown()).optional(),
    data: z.record(z.unknown()).optional(),
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
  if (["paid", "approved", "completed", "authorized", "success"].some((s) => status.includes(s))) {
    return "approved";
  }
  if (["pending", "waiting", "processing", "open", "in_analysis"].some((s) => status.includes(s))) {
    return "pending";
  }
  if (["failed", "refused", "refunded", "chargeback", "canceled", "cancelled", "expired"].some((s) => status.includes(s))) {
    return "failed";
  }
  return "unknown";
}

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyHublaWebhook(
  headers: IncomingHttpHeaders,
  body: unknown,
  credentials?: { token?: string | null; secret?: string | null },
): { ok: true } | { ok: false; reason: string } {
  const token = credentials?.token?.trim() || process.env.HUBLA_WEBHOOK_TOKEN?.trim();
  const secret = credentials?.secret?.trim() || process.env.HUBLA_WEBHOOK_SECRET?.trim();

  if (!token && !secret) {
    return { ok: false, reason: "hubla_signature_not_configured" };
  }

  if (token) {
    const headerRaw = headers["x-hubla-token"] ?? headers["x-hubla-webhook-token"];
    const provided = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
    if (typeof provided !== "string" || !provided.trim()) {
      return { ok: false, reason: "hubla_token_missing" };
    }
    if (!safeEq(provided.trim(), token)) {
      return { ok: false, reason: "hubla_token_invalid" };
    }
    return { ok: true };
  }

  const signatureRaw = headers["x-hubla-signature"];
  const providedSig = Array.isArray(signatureRaw) ? signatureRaw[0] : signatureRaw;
  if (typeof providedSig !== "string" || !providedSig.trim()) {
    return { ok: false, reason: "hubla_signature_missing" };
  }

  const computed = createHmac("sha256", secret ?? "")
    .update(JSON.stringify(body ?? {}), "utf8")
    .digest("hex");

  if (!safeEq(providedSig.trim().toLowerCase(), computed.toLowerCase())) {
    return { ok: false, reason: "hubla_signature_invalid" };
  }
  return { ok: true };
}

export function parseHublaToCanonical(params: {
  tenantId: string;
  idempotencyKey: string;
  payloadHash: string;
  payload: unknown;
}): CanonicalEvent | null {
  const parsed = hublaPayloadSchema.safeParse(params.payload);
  if (!parsed.success) return null;

  const root = asObject(parsed.data);
  const data = asObject(root.data);
  const order = asObject(root.order);
  const customer = asObject(root.customer);
  const sourceOrder = Object.keys(order).length > 0 ? order : asObject(data.order);
  const sourceCustomer = Object.keys(customer).length > 0 ? customer : asObject(data.customer);

  const rawStatus =
    pickString(root, ["payment_status", "status", "event"]) ??
    pickString(sourceOrder, ["status", "payment_status"]);
  const outcome = inferOutcome(rawStatus);

  const amountRaw =
    pickNumber(root, ["amount_cents", "amount"]) ??
    pickNumber(sourceOrder, ["amount_cents", "amount", "total"]);
  const amountCents =
    amountRaw === undefined ? 0 : Number.isInteger(amountRaw) && Math.abs(amountRaw) >= 1000 ? Math.trunc(amountRaw) : Math.round(amountRaw * 100);

  return {
    idempotencyKey: params.idempotencyKey,
    tenantId: params.tenantId,
    integration: "hubla",
    occurredAt: new Date().toISOString(),
    customer: {
      externalId: pickString(sourceCustomer, ["id", "external_id", "document"]) ?? "unknown",
      email: pickString(sourceCustomer, ["email"]),
      phoneE164: pickString(sourceCustomer, ["phone", "phone_number"]),
      name: pickString(sourceCustomer, ["name"]),
    },
    order: {
      externalId:
        pickString(root, ["id", "order_id", "transaction_id"]) ??
        pickString(sourceOrder, ["id", "order_id"]) ??
        "unknown",
      amountCents,
      currency: pickString(root, ["currency"]) ?? pickString(sourceOrder, ["currency"]) ?? "BRL",
      productName: pickString(sourceOrder, ["product_name", "name"]),
    },
    payment: { outcome },
    rawRef: { provider: "hubla", payloadHash: params.payloadHash },
  };
}

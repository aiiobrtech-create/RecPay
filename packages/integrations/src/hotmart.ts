import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import type { CanonicalEvent, PaymentOutcome } from "@re/core";

const hotmartPayloadSchema = z
  .object({
    event: z.string().optional(),
    data: z.record(z.unknown()).optional(),
    buyer: z.record(z.unknown()).optional(),
    purchase: z.record(z.unknown()).optional(),
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
  if (["approved", "completed", "paid"].some((s) => status.includes(s))) {
    return "approved";
  }
  if (["pending", "waiting", "processing", "under_review", "billet_printed"].some((s) => status.includes(s))) {
    return "pending";
  }
  if (["refunded", "canceled", "cancelled", "chargeback", "expired", "failed", "delayed"].some((s) => status.includes(s))) {
    return "failed";
  }
  return "unknown";
}

function pickTimestamp(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Date(value).toISOString();
    }
    if (typeof value === "string" && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return new Date(numeric).toISOString();
      }
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }
  return undefined;
}

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyHotmartWebhook(
  headers: IncomingHttpHeaders,
  body: unknown,
  credentials?: { hottok?: string | null; secret?: string | null },
): { ok: true } | { ok: false; reason: string } {
  const expectedHottok = credentials?.hottok?.trim() || process.env.HOTMART_HOTTOK?.trim();
  const expectedSecret = credentials?.secret?.trim() || process.env.HOTMART_WEBHOOK_SECRET?.trim();

  if (!expectedHottok && !expectedSecret) {
    return { ok: true };
  }

  if (expectedHottok) {
    const headerTokenRaw = headers["x-hotmart-hottok"] ?? headers["x-hotmart-token"] ?? headers["hottok"];
    const headerToken = Array.isArray(headerTokenRaw) ? headerTokenRaw[0] : headerTokenRaw;
    if (typeof headerToken !== "string" || !headerToken.trim()) {
      return { ok: false, reason: "hotmart_hottok_missing" };
    }
    if (!safeEq(headerToken.trim(), expectedHottok)) {
      return { ok: false, reason: "hotmart_hottok_invalid" };
    }
    return { ok: true };
  }

  const headerSigRaw = headers["x-hotmart-signature"];
  const headerSig = Array.isArray(headerSigRaw) ? headerSigRaw[0] : headerSigRaw;
  if (typeof headerSig !== "string" || !headerSig.trim()) {
    return { ok: false, reason: "hotmart_signature_missing" };
  }

  const computed = createHmac("sha256", expectedSecret ?? "")
    .update(JSON.stringify(body ?? {}), "utf8")
    .digest("hex");
  if (!safeEq(headerSig.trim().toLowerCase(), computed.toLowerCase())) {
    return { ok: false, reason: "hotmart_signature_invalid" };
  }
  return { ok: true };
}

export function parseHotmartToCanonical(params: {
  tenantId: string;
  idempotencyKey: string;
  payloadHash: string;
  payload: unknown;
}): CanonicalEvent | null {
  const parsed = hotmartPayloadSchema.safeParse(params.payload);
  if (!parsed.success) return null;

  const root = asObject(parsed.data);
  const data = asObject(root.data);
  const purchase = asObject(data.purchase);
  const buyer = asObject(data.buyer);
  const product = asObject(data.product);
  const rootBuyer = asObject(root.buyer);
  const sourceBuyer = Object.keys(buyer).length > 0 ? buyer : rootBuyer;
  const purchasePrice = asObject(purchase.price);
  const purchaseFullPrice = asObject(purchase.full_price);

  const purchaseStatus =
    pickString(purchase, ["status", "purchase_status"]) ??
    pickString(root, ["status"]) ??
    pickString(root, ["event"]);
  const outcome = inferOutcome(purchaseStatus);

  const amountRaw =
    pickNumber(purchase, ["price", "price_value", "value", "amount"]) ??
    pickNumber(purchasePrice, ["value"]) ??
    pickNumber(purchaseFullPrice, ["value"]) ??
    pickNumber(data, ["value", "amount"]);
  const amountCents =
    amountRaw === undefined ? 0 : Number.isInteger(amountRaw) && Math.abs(amountRaw) >= 1000 ? Math.trunc(amountRaw) : Math.round(amountRaw * 100);

  const occurredAt =
    pickTimestamp(data, ["happened_at", "created_at", "approved_date"]) ??
    pickTimestamp(purchase, ["approved_date", "order_date"]) ??
    pickTimestamp(root, ["creation_date"]) ??
    new Date().toISOString();

  return {
    idempotencyKey: params.idempotencyKey,
    tenantId: params.tenantId,
    integration: "hotmart",
    occurredAt,
    customer: {
      externalId:
        pickString(sourceBuyer, ["id", "code", "external_id"]) ??
        pickString(data, ["buyer_id"]) ??
        "unknown",
      email: pickString(sourceBuyer, ["email"]),
      phoneE164: (() => {
        const directPhone = pickString(sourceBuyer, ["phone", "phone_number"]);
        if (directPhone) return directPhone;
        const checkoutPhone = [
          pickString(sourceBuyer, ["checkout_phone_code"]),
          pickString(sourceBuyer, ["checkout_phone"]),
        ]
          .filter(Boolean)
          .join("");
        return checkoutPhone || undefined;
      })(),
      name: pickString(sourceBuyer, ["name"]),
    },
    order: {
      externalId:
        pickString(purchase, ["transaction", "order_id", "id"]) ??
        pickString(data, ["transaction"]) ??
        "unknown",
      amountCents,
      currency:
        pickString(purchase, ["currency", "currency_code"]) ??
        pickString(purchasePrice, ["currency", "currency_value"]) ??
        pickString(purchaseFullPrice, ["currency", "currency_value"]) ??
        "BRL",
      productName: pickString(data, ["product_name", "name"]) ?? pickString(product, ["name"]),
    },
    payment: { outcome },
    rawRef: { provider: "hotmart", payloadHash: params.payloadHash },
  };
}

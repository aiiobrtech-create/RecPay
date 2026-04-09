import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { CanonicalEvent, PaymentOutcome } from "@re/core";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function firstObject(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    const obj = asObject(value);
    if (Object.keys(obj).length > 0) return obj;
  }
  return {};
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

export function looksLikeHublaWebhook(body: unknown): boolean {
  const root = asObject(body);
  const event = asObject(root.event);
  const type = typeof root.type === "string" ? root.type.trim().toLowerCase() : "";
  const version = typeof root.version === "string" ? root.version.trim().toLowerCase() : "";

  if (type.startsWith("invoice.") || type.startsWith("subscription.") || type.startsWith("customer.") || type.startsWith("lead.")) {
    return true;
  }

  if (version === "v2.0.0" || version === "2.0.0") {
    return Object.keys(event).length > 0;
  }

  if (Object.keys(event).length > 0) {
    return (
      typeof root.type === "string" ||
      typeof root.id === "string" ||
      typeof root.id === "number" ||
      typeof root.payment_status === "string" ||
      typeof root.status === "string"
    );
  }

  return (
    typeof root.id === "string" ||
    typeof root.id === "number" ||
    typeof root.payment_status === "string" ||
    typeof root.status === "string"
  );
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
  const root = asObject(params.payload);
  if (Object.keys(root).length === 0) return null;
  const data = asObject(root.data);
  const event = asObject(root.event);
  const eventProducts = Array.isArray(event.products) ? event.products : Array.isArray(data.products) ? data.products : [];
  const firstEventProduct = eventProducts.length > 0 ? asObject(eventProducts[0]) : {};
  const order = firstObject(root.order, data.order, event.invoice, event.subscription, event.lead);
  const customer = firstObject(root.customer, root.user, data.customer, data.user, event.payer, event.user);
  const invoice = firstObject(event.invoice, data.invoice, root.invoice);
  const subscription = firstObject(event.subscription, data.subscription, root.subscription);
  const lead = firstObject(event.lead, data.lead, root.lead);
  const sourceOrder = Object.keys(order).length > 0 ? order : firstObject(invoice, subscription, lead);
  const sourceCustomer =
    Object.keys(customer).length > 0 ? customer : firstObject(invoice.payer, subscription, lead, event.customer);
  const payerName =
    [pickString(sourceCustomer, ["firstName", "first_name"]), pickString(sourceCustomer, ["lastName", "last_name"])]
      .filter(Boolean)
      .join(" ")
      .trim() || undefined;

  const rawStatus =
    pickString(root, ["payment_status", "status", "type", "event"]) ??
    pickString(event, ["payment_status", "status", "type"]) ??
    pickString(invoice, ["status", "payment_status", "type"]) ??
    pickString(subscription, ["status", "payment_status", "type"]) ??
    pickString(lead, ["status", "payment_status", "type"]) ??
    pickString(sourceOrder, ["status", "payment_status"]);
  const outcome = inferOutcome(rawStatus);

  const amountRaw =
    pickNumber(root, ["amount_cents", "amount"]) ??
    pickNumber(event, ["totalAmount", "amount", "amount_cents", "amountCents", "value"]) ??
    pickNumber(invoice, ["amount_cents", "amount", "total_cents", "total"]) ??
    pickNumber(asObject(invoice.amount), ["totalCents", "subtotalCents", "total", "amount"]) ??
    pickNumber(subscription, ["amount_cents", "amount", "total_cents", "total"]) ??
    pickNumber(sourceOrder, ["amount_cents", "amount", "total", "value"]);
  const amountCents =
    amountRaw === undefined ? 0 : Number.isInteger(amountRaw) && Math.abs(amountRaw) >= 1000 ? Math.trunc(amountRaw) : Math.round(amountRaw * 100);

  const occurredAt =
    pickString(event, ["createdAt", "paidAt", "expiresAt", "modifiedAt"]) ??
    pickString(invoice, ["saleDate", "createdAt", "created_at", "modifiedAt", "modified_at", "dueDate", "due_date"]) ??
    pickString(subscription, ["createdAt", "created_at", "modifiedAt", "modified_at", "activatedAt", "activated_at"]) ??
    pickString(lead, ["createdAt", "created_at", "modifiedAt", "modified_at"]) ??
    new Date().toISOString();

  return {
    idempotencyKey: params.idempotencyKey,
    tenantId: params.tenantId,
    integration: "hubla",
    occurredAt,
    customer: {
      externalId:
        pickString(sourceCustomer, ["id", "external_id", "document", "payerId"]) ??
        pickString(event, ["userId"]) ??
        pickString(event, ["payerId"]) ??
        "unknown",
      email:
        pickString(sourceCustomer, ["email"]) ??
        pickString(event, ["userEmail", "email"]) ??
        pickString(event, ["payerEmail"]),
      phoneE164:
        pickString(sourceCustomer, ["phone", "phone_number", "phoneE164"]) ??
        pickString(event, ["userPhone", "phone"]) ??
        pickString(event, ["payerPhone"]),
      name:
        pickString(sourceCustomer, ["name", "fullName", "full_name"]) ??
        payerName ??
        pickString(event, ["userName", "name", "fullName"]),
    },
    order: {
      externalId:
        pickString(event, ["transactionId", "transaction_id", "saleId", "sale_id"]) ??
        pickString(root, ["id", "order_id", "transaction_id"]) ??
        pickString(invoice, ["id", "invoice_id"]) ??
        pickString(subscription, ["id", "subscription_id"]) ??
        pickString(lead, ["id", "lead_id"]) ??
        pickString(sourceOrder, ["id", "order_id"]) ??
        "unknown",
      amountCents,
      currency:
        pickString(root, ["currency"]) ??
        pickString(event, ["currency"]) ??
        pickString(invoice, ["currency"]) ??
        pickString(subscription, ["currency"]) ??
        pickString(sourceOrder, ["currency"]) ??
        "BRL",
      productName:
        pickString(sourceOrder, ["product_name", "name"]) ??
        pickString(event, ["groupName", "group_name", "productName", "product_name"]) ??
        pickString(firstObject(event.product, firstEventProduct), ["name"]),
    },
    payment: { outcome },
    rawRef: { provider: "hubla", payloadHash: params.payloadHash },
  };
}

/**
 * Evento interno único — todas as integrações normalizam para este formato.
 */
export type PaymentOutcome = "failed" | "pending" | "approved" | "unknown";
export type CanonicalEventType = "payment_failed" | "payment_pending" | "payment_approved" | "unknown";

export interface CanonicalEvent {
  idempotencyKey: string;
  tenantId: string;
  integration: "hotmart" | "kiwify" | "hubla" | "generic";
  eventType?: CanonicalEventType;
  occurredAt: string;
  customer: {
    externalId: string;
    email?: string;
    phoneE164?: string;
    name?: string;
  };
  order: {
    externalId: string;
    amountCents: number;
    currency: string;
    productName?: string;
  };
  payment: { outcome: PaymentOutcome };
  rawRef: { provider: string; payloadHash: string };
}

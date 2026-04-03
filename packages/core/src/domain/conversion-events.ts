/**
 * Catálogo de eventos de negócio usados como gatilho de fluxos de mensagem (MVP: WhatsApp).
 * Valores estáveis para armazenar em `recovery_flows.trigger_event_type` e comparação no worker.
 */
export const CONVERSION_TRIGGER_EVENTS = [
  "payment_failed",
  "payment_pending",
  "payment_approved",
  "abandoned_checkout",
  "unknown",
] as const;

export type ConversionTriggerEventType = (typeof CONVERSION_TRIGGER_EVENTS)[number];

export function isConversionTriggerEventType(value: string): value is ConversionTriggerEventType {
  return (CONVERSION_TRIGGER_EVENTS as readonly string[]).includes(value);
}

/**
 * Mensagens de **recuperação de venda** (WhatsApp): não inclui pós-venda.
 * `payment_approved` segue no catálogo geral para atribuição / BI, mas não dispara este fluxo.
 */
export const RECOVERY_SALES_TRIGGER_EVENTS = ["payment_failed", "payment_pending", "abandoned_checkout"] as const;

export type RecoverySalesTriggerEventType = (typeof RECOVERY_SALES_TRIGGER_EVENTS)[number];

export function isRecoverySalesTriggerEventType(value: string): value is RecoverySalesTriggerEventType {
  return (RECOVERY_SALES_TRIGGER_EVENTS as readonly string[]).includes(value);
}

/**
 * Mapa legível para documentação e UI (português).
 */
export const CONVERSION_TRIGGER_EVENT_LABELS: Record<ConversionTriggerEventType, string> = {
  payment_failed: "Falha no pagamento",
  payment_pending: "Pagamento pendente",
  payment_approved: "Pagamento aprovado (atribuição / pós-venda)",
  abandoned_checkout: "Checkout abandonado",
  unknown: "Indefinido",
};

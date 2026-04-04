/**
 * Limites mensais por plano comercial (espelho da LP: Essencial, Growth, Scale).
 * `null` em eventos ou recuperações = sem teto técnico (tier Scale / contrato).
 */
export type BillingPlanCode = "essential" | "growth" | "scale";

export const BILLING_PLAN_LIMITS: Record<
  BillingPlanCode,
  { events: number | null; recovery: number | null }
> = {
  /** LP: até 100 recuperações/mês; webhooks no limite do plano */
  essential: { events: 5000, recovery: 100 },
  /** LP: até 300 recuperações/mês; mais eventos que o Essencial */
  growth: { events: 15000, recovery: 300 },
  /** LP: volume alto / enterprise — franquia e excedente no contrato */
  scale: { events: null, recovery: null },
};

export function parseBillingPlanCode(raw: string | undefined | null): BillingPlanCode | null {
  if (raw == null || raw === "") return null;
  const n = String(raw).trim().toLowerCase();
  if (n === "essential" || n === "essencial") return "essential";
  if (n === "growth") return "growth";
  if (n === "scale") return "scale";
  return null;
}

export function limitsForBillingPlan(plan: BillingPlanCode): {
  planMonthlyEventsLimit: number | null;
  planMonthlyRecoveryLimit: number | null;
} {
  const L = BILLING_PLAN_LIMITS[plan];
  return {
    planMonthlyEventsLimit: L.events,
    planMonthlyRecoveryLimit: L.recovery,
  };
}

/** Fallback quando não há metadata Stripe nem env (tier entrada). */
export const DEFAULT_STRIPE_FALLBACK_LIMITS = limitsForBillingPlan("essential");

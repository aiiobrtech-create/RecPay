/** Janela padrão de atribuição “último toque” em horas (pagamento após tentativa de recuperação). */
export const DEFAULT_ATTRIBUTION_WINDOW_HOURS = 72;

export type AttributionInput = {
  attemptCreatedAt: Date;
  conversionEventCreatedAt: Date;
  windowHours?: number;
};

/**
 * Atribui conversão se o evento de pagamento aprovado ocorrer dentro da janela após a tentativa.
 */
export function isWithinAttributionWindow(input: AttributionInput): boolean {
  const hours = input.windowHours ?? DEFAULT_ATTRIBUTION_WINDOW_HOURS;
  const ms = hours * 3600_000;
  const delta = input.conversionEventCreatedAt.getTime() - input.attemptCreatedAt.getTime();
  return delta >= 0 && delta <= ms;
}

import { APP_DEFAULTS } from "./defaults.js";

export interface AppIdentity {
  /** ID estável / técnico (não use como nome de marca final sem revisar). */
  id: string;
  displayName: string;
  slug: string;
}

function trimOr<T extends string | undefined>(v: T, fallback: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : fallback;
}

/**
 * Identidade pública do produto — sempre ler de `getAppIdentity()`, nunca hardcodar nome em vários arquivos.
 * Prioridade: env > defaults em `defaults.ts`.
 */
export function getAppIdentity(): AppIdentity {
  return {
    id: trimOr(process.env.APP_ID, APP_DEFAULTS.id),
    displayName: trimOr(process.env.APP_DISPLAY_NAME, APP_DEFAULTS.displayName),
    slug: trimOr(process.env.APP_SLUG, APP_DEFAULTS.slug),
  };
}

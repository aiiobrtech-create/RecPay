export interface SupabasePublicConfig {
  url: string;
  /** Chave `anon` (pública). Só para cliente/browser com RLS — nunca `service_role`. */
  anonKey: string;
}

/**
 * Config pública do Supabase (URL + anon key) para o dashboard ou `@supabase/supabase-js` no browser.
 * Retorna `null` se faltar variável obrigatória.
 */
export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

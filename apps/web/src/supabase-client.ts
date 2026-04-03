import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

export const isSupabaseBrowserConfigured = Boolean(url && anon);

export const supabase: SupabaseClient | null = isSupabaseBrowserConfigured
  ? createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        /** Necessário para processar `#access_token=…&type=recovery` ao abrir o link do e-mail no painel. */
        detectSessionInUrl: true,
      },
    })
  : null;

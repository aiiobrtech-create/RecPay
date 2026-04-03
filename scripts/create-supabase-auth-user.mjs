/**
 * Cria utilizador no Supabase Auth (via Admin API). Requer no .env da raiz:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   CREATE_USER_EMAIL=danilo@exemplo.com CREATE_USER_PASSWORD='senhaSegura123' node scripts/create-supabase-auth-user.mjs
 * Se omitir CREATE_USER_PASSWORD, gera uma senha aleatória e imprime uma vez.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const email = process.env.CREATE_USER_EMAIL?.trim();
let password = process.env.CREATE_USER_PASSWORD?.trim();

if (!url || !serviceKey) {
  console.error(
    "Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env (Supabase → Settings → API → service_role).",
  );
  process.exit(1);
}

if (!email) {
  console.error("Defina CREATE_USER_EMAIL, ex.: danilo@danilovieiradesigner.com");
  process.exit(1);
}

if (!password) {
  password = `re-${randomBytes(12).toString("base64url")}`;
  console.error("CREATE_USER_PASSWORD não definido — senha temporária gerada (mostrada abaixo).");
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { created_via: "create-supabase-auth-user.mjs" },
});

if (error) {
  console.error("CREATE_USER_FAIL", error.message);
  process.exit(1);
}

console.log("CREATE_USER_OK");
console.log("userId:", data.user?.id);
console.log("email:", data.user?.email);
console.log("--- Guarde a senha num gestor seguro. Não commite. ---");
console.log("password:", password);
console.log("--- Para ligar ao tenant: LINK_TENANT_ID=<uuid> LINK_USER_ID=" + data.user?.id + " npm run link:membership");

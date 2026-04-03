/**
 * Define uma nova palavra-passe para um utilizador (Supabase Auth) via Admin API.
 * Não envia e-mail — útil quando a recuperação por correio está em rate limit.
 *
 * Uso (PowerShell):
 *   $env:RESET_USER_EMAIL="danilo@danilovieiradesigner.com"
 *   $env:RESET_USER_PASSWORD="SuaNovaSenhaForte123"
 *   npm run user:reset-password
 *
 * Requer no .env da raiz: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const email = process.env.RESET_USER_EMAIL?.trim().toLowerCase();
const newPassword = process.env.RESET_USER_PASSWORD?.trim();

if (!url || !serviceKey) {
  console.error("Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.");
  process.exit(1);
}
if (!email || !newPassword) {
  console.error("Defina RESET_USER_EMAIL e RESET_USER_PASSWORD.");
  process.exit(1);
}
if (newPassword.length < 8) {
  console.error("Use uma palavra-passe com pelo menos 8 caracteres.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let page = 1;
const perPage = 200;
let userId = null;

for (;;) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
  if (error) {
    console.error("LIST_USERS_FAIL", error.message);
    process.exit(1);
  }
  const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (found) {
    userId = found.id;
    break;
  }
  if (data.users.length < perPage) break;
  page += 1;
}

if (!userId) {
  console.error("Utilizador não encontrado com este e-mail:", email);
  process.exit(1);
}

const { error: updErr } = await supabase.auth.admin.updateUserById(userId, { password: newPassword });

if (updErr) {
  console.error("UPDATE_PASSWORD_FAIL", updErr.message);
  process.exit(1);
}

console.log("RESET_PASSWORD_OK");
console.log("userId:", userId);
console.log("email:", email);
console.log("Pode fazer login no painel com esta palavra-passe (guarde em local seguro).");

/**
 * Altera o e-mail de um utilizador (Admin API). O user id mantém-se; memberships não precisam de mudar.
 *
 *   $env:UPDATE_USER_FROM_EMAIL="antigo@..."
 *   $env:UPDATE_USER_TO_EMAIL="novo@..."
 *   npm run user:update-email
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const fromEmail = process.env.UPDATE_USER_FROM_EMAIL?.trim().toLowerCase();
const toEmail = process.env.UPDATE_USER_TO_EMAIL?.trim().toLowerCase();

if (!url || !serviceKey) {
  console.error("Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.");
  process.exit(1);
}
if (!fromEmail || !toEmail) {
  console.error("Defina UPDATE_USER_FROM_EMAIL e UPDATE_USER_TO_EMAIL.");
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
  const found = data.users.find((u) => (u.email ?? "").toLowerCase() === fromEmail);
  if (found) {
    userId = found.id;
    break;
  }
  if (data.users.length < perPage) break;
  page += 1;
}

if (!userId) {
  console.error("Nenhum utilizador com e-mail:", fromEmail);
  process.exit(1);
}

const { data: updated, error: updErr } = await supabase.auth.admin.updateUserById(userId, {
  email: toEmail,
  email_confirm: true,
});

if (updErr) {
  console.error("UPDATE_EMAIL_FAIL", updErr.message);
  process.exit(1);
}

console.log("UPDATE_EMAIL_OK");
console.log("userId:", userId);
console.log("novo email:", updated.user?.email ?? toEmail);

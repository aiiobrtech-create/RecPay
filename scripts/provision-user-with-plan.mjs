/**
 * Cria utilizador no Supabase Auth (se não existir) e um tenant com plano + membership owner.
 * Requer no .env da raiz: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   PROVISION_EMAIL=renan@exemplo.com PROVISION_BILLING_PLAN=essential node scripts/provision-user-with-plan.mjs
 * Plano: essential | growth | scale (default: essential)
 * Senha: defina PROVISION_PASSWORD ou omita para gerar uma temporária (só para utilizador novo).
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import postgres from "postgres";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const email = process.env.PROVISION_EMAIL?.trim()?.toLowerCase();
const planRaw = (process.env.PROVISION_BILLING_PLAN ?? "essential").trim().toLowerCase();

const PLAN_LIMITS = {
  essential: { events: 5000, recovery: 100 },
  growth: { events: 15000, recovery: 300 },
  scale: { events: null, recovery: null },
};

function normalizePlan(p) {
  if (p === "essencial") return "essential";
  if (p === "essential" || p === "growth" || p === "scale") return p;
  return null;
}

function tenantNameFromEmail(addr) {
  const local = addr.split("@")[0]?.trim();
  return local || "Minha conta";
}

if (!databaseUrl) {
  console.error("DATABASE_URL ausente no .env.");
  process.exit(1);
}
if (!supabaseUrl || !serviceKey) {
  console.error("Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.");
  process.exit(1);
}
if (!email || !email.includes("@")) {
  console.error("Defina PROVISION_EMAIL com um e-mail válido.");
  process.exit(1);
}

const billingPlan = normalizePlan(planRaw);
if (!billingPlan) {
  console.error("PROVISION_BILLING_PLAN inválido. Use essential, growth ou scale.");
  process.exit(1);
}

const limits = PLAN_LIMITS[billingPlan];
const sql = postgres(databaseUrl, { max: 1 });
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

try {
  const [existingAuth] = await sql`
    SELECT id, email FROM auth.users WHERE lower(email) = lower(${email}) LIMIT 1
  `;

  let userId;
  let passwordPrinted = null;

  if (existingAuth) {
    userId = existingAuth.id;
    console.info("AUTH_USER_EXISTS id=%s", userId);
  } else {
    let password = process.env.PROVISION_PASSWORD?.trim();
    if (!password) {
      password = `re-${randomBytes(12).toString("base64url")}`;
      passwordPrinted = password;
      console.info("Senha temporária gerada (utilizador novo).");
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { created_via: "provision-user-with-plan.mjs" },
    });

    if (error) {
      console.error("CREATE_USER_FAIL", error.message);
      process.exit(1);
    }
    userId = data.user?.id;
    if (!userId) {
      console.error("CREATE_USER_FAIL sem user.id");
      process.exit(1);
    }
    console.info("AUTH_USER_CREATED id=%s", userId);
  }

  const [membership] = await sql`
    SELECT tenant_id, role FROM memberships WHERE user_id = ${userId} LIMIT 1
  `;

  if (membership) {
    await sql`
      UPDATE tenants
      SET
        billing_plan = ${billingPlan},
        plan_monthly_events_limit = ${limits.events},
        plan_monthly_recovery_limit = ${limits.recovery}
      WHERE id = ${membership.tenant_id}
    `;
    console.info(
      "TENANT_ATUALIZADO tenant=%s plano=%s eventos=%s recuperacoes=%s",
      membership.tenant_id,
      billingPlan,
      limits.events ?? "null",
      limits.recovery ?? "null",
    );
    console.info("Já existia membership; limites e billing_plan do tenant foram alinhados ao plano.");
  } else {
    const name = tenantNameFromEmail(email);
    const [tenant] = await sql`
      INSERT INTO tenants (
        name,
        plan_monthly_events_limit,
        plan_monthly_recovery_limit,
        billing_plan,
        recovery_contact_cooldown_minutes,
        recovery_contact_max_attempts_per_day
      )
      VALUES (
        ${name},
        ${limits.events},
        ${limits.recovery},
        ${billingPlan},
        180,
        3
      )
      RETURNING id
    `;

    await sql`
      INSERT INTO memberships (tenant_id, user_id, role)
      VALUES (${tenant.id}, ${userId}, 'owner')
    `;

    console.info("TENANT_CRIADO tenant=%s nome=%s", tenant.id, name);
    console.info("MEMBERSHIP_OK role=owner");
  }

  if (passwordPrinted) {
    console.info("");
    console.info("--- Guarde a senha num gestor seguro. Não commite. ---");
    console.info("password:", passwordPrinted);
    console.info("");
  }

  console.info("PROVISION_OK email=%s plano=%s", email, billingPlan);
} catch (e) {
  console.error("PROVISION_FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}

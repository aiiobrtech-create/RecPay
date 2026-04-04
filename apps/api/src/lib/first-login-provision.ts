import { createHash } from "node:crypto";
import {
  DEFAULT_STRIPE_FALLBACK_LIMITS,
  limitsForBillingPlan,
  parseBillingPlanCode,
} from "@re/core";
import { memberships, sql, tenants, type DbClient } from "@re/db";
import { eq } from "drizzle-orm";

type AuthenticatedUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function advisoryLockExpr(userId: string) {
  const buf = createHash("sha256").update(userId, "utf8").digest();
  const k1 = buf.readInt32BE(0);
  const k2 = buf.readInt32BE(4);
  return sql`select pg_advisory_xact_lock(${k1}::int, ${k2}::int)`;
}

function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function deriveTenantNameForFirstLogin(user: AuthenticatedUser): string {
  const metadata = user.user_metadata ?? {};
  const explicit =
    cleanDisplayName(metadata.company_name) ||
    cleanDisplayName(metadata.company) ||
    cleanDisplayName(metadata.organization_name) ||
    cleanDisplayName(metadata.org_name) ||
    cleanDisplayName(metadata.name) ||
    cleanDisplayName(metadata.full_name);
  if (explicit) return explicit;

  const email = user.email?.trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }

  return "Minha conta";
}

/**
 * Provisiona uma conta padrão para o usuário autenticado quando ele ainda não possui membership.
 * Mantém o modelo multi-tenant intacto, mas evita setup manual no primeiro acesso.
 */
export async function ensureUserHasTenantMembership(
  db: DbClient,
  user: AuthenticatedUser,
): Promise<void> {
  const [existing] = await db
    .select({ tenantId: memberships.tenantId })
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);
  if (existing) return;

  await db.transaction(async (tx) => {
    await tx.execute(advisoryLockExpr(user.id));

    const [again] = await tx
      .select({ tenantId: memberships.tenantId })
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .limit(1);
    if (again) return;

    const initialPlan = parseBillingPlanCode(process.env.FIRST_LOGIN_DEFAULT_BILLING_PLAN) ?? null;
    const defaults =
      initialPlan != null
        ? limitsForBillingPlan(initialPlan)
        : DEFAULT_STRIPE_FALLBACK_LIMITS;

    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: deriveTenantNameForFirstLogin(user),
        billingPlan: initialPlan,
        planMonthlyEventsLimit: defaults.planMonthlyEventsLimit,
        planMonthlyRecoveryLimit: defaults.planMonthlyRecoveryLimit,
        recoveryContactCooldownMinutes: 180,
        recoveryContactMaxAttemptsPerDay: 3,
      })
      .returning({ id: tenants.id });
    if (!tenant) throw new Error("first_login_tenant_insert_failed");

    await tx.insert(memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      role: "owner",
    });
  });
}

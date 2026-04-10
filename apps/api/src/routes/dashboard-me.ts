import { asc, eq } from "drizzle-orm";
import { dashboardOperatorAccess, memberships, tenants } from "@re/db";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { getDb } from "../db.js";
import { extractBearerToken, isDashboardAuthEnforced } from "../auth/dashboard-auth.js";
import { ensureUserHasTenantMembership } from "../lib/first-login-provision.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";

type MeUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

const legacyAnonymousMe = {
  ok: true as const,
  authMode: "legacy" as const,
  userId: null,
  email: null,
  tenants: [] as Array<{ id: string; name: string; role: string }>,
  operationalAccess: {
    canReviewRecoveryLinks: false,
  },
};

/** `legacy-soft`: sem DB responde 200 + tenants vazio (compatível com deploy legado); caso contrário 503. */
async function replyWithDashboardMeForUser(
  reply: FastifyReply,
  user: MeUser,
  dbUnavailableBehavior: "strict" | "legacy-soft" = "strict",
): Promise<void> {
  const db = getDb();
  if (!db) {
    if (dbUnavailableBehavior === "legacy-soft") {
      await reply.status(200).send(legacyAnonymousMe);
      return;
    }
    await reply.status(503).send({ ok: false, error: "database_unavailable" });
    return;
  }

  const [operatorRow] = await db
    .select({ userId: dashboardOperatorAccess.userId })
    .from(dashboardOperatorAccess)
    .where(eq(dashboardOperatorAccess.userId, user.id))
    .limit(1);

  if (!operatorRow) {
    await ensureUserHasTenantMembership(db, user);
  }

  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(eq(memberships.userId, user.id))
    .orderBy(asc(tenants.name));

  await reply.status(200).send({
    ok: true,
    authMode: "bearer" as const,
    userId: user.id,
    email: user.email ?? null,
    tenants: rows.map((r) => ({ id: r.id, name: r.name, role: r.role })),
    operationalAccess: {
      canReviewRecoveryLinks: Boolean(operatorRow),
    },
  });
}

export const dashboardMeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard/me", async (req, reply) => {
    if (!isDashboardAuthEnforced()) {
      const token = extractBearerToken(req);
      if (!token) {
        return reply.status(200).send(legacyAnonymousMe);
      }

      const supabase = getSupabaseAdmin();
      if (!supabase) {
        return reply.status(200).send(legacyAnonymousMe);
      }

      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return reply.status(200).send(legacyAnonymousMe);
      }

      await replyWithDashboardMeForUser(reply, data.user, "legacy-soft");
      return;
    }

    const token = extractBearerToken(req);
    if (!token) {
      return reply.status(401).send({ ok: false, error: "bearer_token_required" });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return reply.status(503).send({ ok: false, error: "auth_not_configured" });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return reply.status(401).send({ ok: false, error: "invalid_token" });
    }

    await replyWithDashboardMeForUser(reply, data.user);
  });
};

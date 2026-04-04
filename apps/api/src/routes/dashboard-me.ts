import { asc, eq } from "drizzle-orm";
import { dashboardOperatorAccess, memberships, tenants } from "@re/db";
import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../db.js";
import { extractBearerToken, isDashboardAuthEnforced } from "../auth/dashboard-auth.js";
import { ensureUserHasTenantMembership } from "../lib/first-login-provision.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";

export const dashboardMeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard/me", async (req, reply) => {
    if (!isDashboardAuthEnforced()) {
      return reply.status(200).send({
        ok: true,
        authMode: "legacy" as const,
        userId: null,
        email: null,
        tenants: [] as Array<{ id: string; name: string; role: string }>,
        operationalAccess: {
          canReviewRecoveryLinks: false,
        },
      });
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

    const db = getDb();
    if (!db) {
      return reply.status(503).send({ ok: false, error: "database_unavailable" });
    }

    const [operatorRow] = await db
      .select({ userId: dashboardOperatorAccess.userId })
      .from(dashboardOperatorAccess)
      .where(eq(dashboardOperatorAccess.userId, data.user.id))
      .limit(1);

    if (!operatorRow) {
      await ensureUserHasTenantMembership(db, data.user);
    }

    const rows = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
      .where(eq(memberships.userId, data.user.id))
      .orderBy(asc(tenants.name));

    return reply.status(200).send({
      ok: true,
      authMode: "bearer" as const,
      userId: data.user.id,
      email: data.user.email ?? null,
      tenants: rows.map((r) => ({ id: r.id, name: r.name, role: r.role })),
      operationalAccess: {
        canReviewRecoveryLinks: Boolean(operatorRow),
      },
    });
  });
};

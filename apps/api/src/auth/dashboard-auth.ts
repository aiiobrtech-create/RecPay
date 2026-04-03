import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { memberships, tenants } from "@re/db";
import { getDb } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";

/**
 * Quando `true`, rotas de dashboard exigem `Authorization: Bearer` (access token do Supabase Auth)
 * e `tenant_id` na membership. Definir explicitamente `true` em produção.
 *
 * Padrão: `false` (modo legado com `?tenantId=` apenas), para não quebrar dev existente.
 */
export function isDashboardAuthEnforced(): boolean {
  const v = process.env.DASHBOARD_AUTH_REQUIRED?.trim().toLowerCase();
  return v === "true" || v === "1";
}

/** Token `ADMIN_API_TOKEN` (scripts / operação interna). Não expor ao cliente final. */
export function isAdminTokenAuthorized(req: FastifyRequest): boolean {
  const expected = process.env.ADMIN_API_TOKEN?.trim();
  if (!expected) return false;
  const raw = req.headers["x-admin-token"];
  const provided = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return Boolean(provided && provided === expected);
}

/**
 * Acesso a rotas `/admin/tenants/:tenantId/*` no painel: sessão Supabase + membership,
 * ou `x-admin-token` (interno).
 * `allowReadonly`: permite papel `readonly` só para leitura (GET).
 */
export async function assertTenantManagementAccess(
  req: FastifyRequest,
  reply: FastifyReply,
  tenantId: string,
  options?: { allowReadonly?: boolean },
): Promise<boolean> {
  delete req.tenantMembershipRole;
  delete req.tenantAccessViaAdminToken;

  if (isAdminTokenAuthorized(req)) {
    req.tenantAccessViaAdminToken = true;
    return true;
  }

  const token = extractBearerToken(req);
  if (!token) {
    await reply.status(401).send({ ok: false, error: "unauthorized" });
    return false;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await reply.status(503).send({ ok: false, error: "auth_not_configured" });
    return false;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    await reply.status(401).send({ ok: false, error: "invalid_token" });
    return false;
  }

  const db = getDb();
  if (!db) {
    await reply.status(503).send({ ok: false, error: "database_unavailable" });
    return false;
  }

  const [m] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, data.user.id), eq(memberships.tenantId, tenantId)))
    .limit(1);

  if (!m) {
    await reply.status(403).send({ ok: false, error: "tenant_forbidden" });
    return false;
  }

  if (m.role === "readonly" && !options?.allowReadonly) {
    await reply.status(403).send({ ok: false, error: "insufficient_role" });
    return false;
  }

  req.tenantMembershipRole = m.role;
  req.tenantAccessViaAdminToken = false;
  return true;
}

export function extractBearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

export function resolveDashboardTenantId(
  req: FastifyRequest,
  queryTenantId: string | undefined,
): { ok: true; tenantId: string } | { ok: false; status: 400 | 403; error: string } {
  const fromAuth = req.dashboardEffectiveTenantId;
  if (fromAuth) {
    if (queryTenantId && queryTenantId !== fromAuth) {
      return { ok: false, status: 403, error: "tenant_forbidden" };
    }
    return { ok: true, tenantId: fromAuth };
  }
  if (!queryTenantId) {
    return { ok: false, status: 400, error: "tenant_id_required" };
  }
  return { ok: true, tenantId: queryTenantId };
}

export function tenantOrReply(
  req: FastifyRequest,
  reply: FastifyReply,
  queryTenantId: string | undefined,
): string | null {
  const resolved = resolveDashboardTenantId(req, queryTenantId);
  if (!resolved.ok) {
    void reply.status(resolved.status).send({ ok: false, error: resolved.error });
    return null;
  }
  return resolved.tenantId;
}

export async function dashboardTenantPreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!isDashboardAuthEnforced()) {
    return;
  }

  const token = extractBearerToken(req);
  if (!token) {
    await reply.status(401).send({ ok: false, error: "bearer_token_required" });
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await reply.status(503).send({ ok: false, error: "auth_not_configured" });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    await reply.status(401).send({ ok: false, error: "invalid_token" });
    return;
  }

  const db = getDb();
  if (!db) {
    await reply.status(503).send({ ok: false, error: "database_unavailable" });
    return;
  }

  const rows = await db
    .select({
      tenantId: memberships.tenantId,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(eq(memberships.userId, data.user.id));

  if (rows.length === 0) {
    await reply.status(403).send({ ok: false, error: "no_tenant_membership" });
    return;
  }

  const rawQuery = req.query as Record<string, string | undefined>;
  const requested = typeof rawQuery.tenantId === "string" ? rawQuery.tenantId.trim() : undefined;

  if (rows.length === 1) {
    const only = rows[0];
    if (requested && requested !== only.tenantId) {
      await reply.status(403).send({ ok: false, error: "tenant_forbidden" });
      return;
    }
    req.dashboardEffectiveTenantId = only.tenantId;
    return;
  }

  if (!requested) {
    await reply.status(400).send({ ok: false, error: "tenant_id_required" });
    return;
  }

  const allowed = rows.some((r) => r.tenantId === requested);
  if (!allowed) {
    await reply.status(403).send({ ok: false, error: "tenant_forbidden" });
    return;
  }
  req.dashboardEffectiveTenantId = requested;
}

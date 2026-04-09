import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { recoveryLinks, tenants } from "@re/db";
import { RECOVERY_SALES_TRIGGER_EVENTS } from "@re/core";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  assertOperationalAccess,
  assertTenantManagementAccess,
  formatDashboardActorLabel,
} from "../auth/dashboard-auth.js";
import { getDb } from "../db.js";

const paramsTenant = z.object({
  tenantId: z.string().uuid(),
});

const paramsLink = z.object({
  tenantId: z.string().uuid(),
  linkId: z.string().uuid(),
});

const triggerSchema = z.enum(RECOVERY_SALES_TRIGGER_EVENTS as unknown as [string, ...string[]]);

export function normalizeRecoveryLinkUrlInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const recoveryLinkBody = z.object({
  label: z.string().min(1).max(200),
  url: z.preprocess(normalizeRecoveryLinkUrlInput, z.string().url().max(2000)),
  platform: z.string().trim().min(1).max(80).nullable().optional(),
  triggerEventType: triggerSchema.nullable().optional(),
  productName: z.string().trim().min(1).max(200).nullable().optional(),
  active: z.boolean().optional(),
  priority: z.coerce.number().int().min(0).max(10_000).optional(),
  submittedBy: z.string().trim().min(1).max(200).nullable().optional(),
});

const adminReviewBody = z.object({
  approvalNote: z.string().trim().min(1).max(1000).optional(),
  reviewedBy: z.string().trim().min(1).max(200).optional(),
});

const operationalRecoveryLinksQuery = z.object({
  tenantId: z.string().uuid().optional(),
  status: z.enum(["pending_review", "approved", "rejected"]).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requestActorLabel(req: {
  dashboardUserId?: string;
  dashboardUserEmail?: string | null;
  tenantMembershipRole?: string;
}): string | null {
  if (req.dashboardUserId) {
    return formatDashboardActorLabel({
      id: req.dashboardUserId,
      email: req.dashboardUserEmail ?? null,
    });
  }
  return req.tenantMembershipRole ?? null;
}

export function requiresReapproval(
  existing: typeof recoveryLinks.$inferSelect,
  next: {
    label?: string;
    url?: string;
    platform?: string | null;
    triggerEventType?: string | null;
    productName?: string | null;
  },
): boolean {
  return (
    (next.label !== undefined && next.label !== existing.label) ||
    (next.url !== undefined && next.url !== existing.url) ||
    (next.platform !== undefined && (next.platform ?? null) !== (existing.platform ?? null)) ||
    (next.triggerEventType !== undefined &&
      (next.triggerEventType ?? null) !== (existing.triggerEventType ?? null)) ||
    (next.productName !== undefined && (next.productName ?? null) !== (existing.productName ?? null))
  );
}

function buildOperationalFilters(
  query: z.infer<typeof operationalRecoveryLinksQuery>,
  options?: { includeStatus?: boolean },
) {
  const filters = [];
  if (query.tenantId) {
    filters.push(eq(recoveryLinks.tenantId, query.tenantId));
  }
  if (options?.includeStatus !== false && query.status) {
    filters.push(eq(recoveryLinks.approvalStatus, query.status));
  }
  const search = query.q?.trim();
  if (search) {
    const term = `%${search}%`;
    filters.push(
      or(
        ilike(recoveryLinks.label, term),
        ilike(recoveryLinks.url, term),
        ilike(recoveryLinks.productName, term),
        ilike(recoveryLinks.platform, term),
      )!,
    );
  }
  return filters;
}

export const tenantRecoveryLinksRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { tenantId: string } }>(
    "/admin/tenants/:tenantId/recovery-links",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const parsed = paramsTenant.safeParse(req.params ?? {});
      if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid_params" });
      const tenantId = parsed.data.tenantId;
      const ok = await assertTenantManagementAccess(req, reply, tenantId, { allowReadonly: true });
      if (!ok) return;

      const db = getDb();
      if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });

      const rows = await db
        .select()
        .from(recoveryLinks)
        .where(eq(recoveryLinks.tenantId, tenantId))
        .orderBy(desc(recoveryLinks.priority), desc(recoveryLinks.updatedAt));

      return reply.status(200).send({
        ok: true,
        items: rows,
        triggerCatalog: RECOVERY_SALES_TRIGGER_EVENTS,
      });
    },
  );

  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    "/admin/tenants/:tenantId/recovery-links",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const parsedParams = paramsTenant.safeParse(req.params ?? {});
      if (!parsedParams.success) return reply.status(400).send({ ok: false, error: "invalid_params" });
      const tenantId = parsedParams.data.tenantId;

      const accessOk = await assertTenantManagementAccess(req, reply, tenantId);
      if (!accessOk) return;

      const parsedBody = recoveryLinkBody.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_body",
          issues: parsedBody.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const db = getDb();
      if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });

      const [row] = await db
        .insert(recoveryLinks)
        .values({
          tenantId,
          label: parsedBody.data.label.trim(),
          url: parsedBody.data.url.trim(),
          platform: normalizeOptionalText(parsedBody.data.platform),
          triggerEventType: parsedBody.data.triggerEventType ?? null,
          productName: normalizeOptionalText(parsedBody.data.productName),
          active: parsedBody.data.active ?? true,
          priority: parsedBody.data.priority ?? 0,
          approvalStatus: "pending_review",
          approvalNote: null,
          submittedBy: requestActorLabel(req) ?? normalizeOptionalText(parsedBody.data.submittedBy),
          reviewedBy: null,
          reviewedAt: null,
        })
        .returning();

      return reply.status(201).send({ ok: true, item: row });
    },
  );

  app.patch<{ Params: { tenantId: string; linkId: string }; Body: unknown }>(
    "/admin/tenants/:tenantId/recovery-links/:linkId",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const parsedParams = paramsLink.safeParse(req.params ?? {});
      if (!parsedParams.success) return reply.status(400).send({ ok: false, error: "invalid_params" });
      const { tenantId, linkId } = parsedParams.data;

      const accessOk = await assertTenantManagementAccess(req, reply, tenantId);
      if (!accessOk) return;

      const parsedBody = recoveryLinkBody.partial().safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_body",
          issues: parsedBody.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      if (Object.keys(parsedBody.data).length === 0) {
        return reply.status(400).send({ ok: false, error: "empty_body" });
      }

      const db = getDb();
      if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });

      const [existing] = await db
        .select()
        .from(recoveryLinks)
        .where(and(eq(recoveryLinks.id, linkId), eq(recoveryLinks.tenantId, tenantId)))
        .limit(1);

      if (!existing) return reply.status(404).send({ ok: false, error: "recovery_link_not_found" });

      const next = {
        label: parsedBody.data.label?.trim(),
        url: parsedBody.data.url?.trim(),
        platform:
          parsedBody.data.platform !== undefined ? normalizeOptionalText(parsedBody.data.platform) : undefined,
        triggerEventType:
          parsedBody.data.triggerEventType !== undefined ? parsedBody.data.triggerEventType ?? null : undefined,
        productName:
          parsedBody.data.productName !== undefined ? normalizeOptionalText(parsedBody.data.productName) : undefined,
      };

      const shouldResetApproval =
        existing.approvalStatus === "approved" && requiresReapproval(existing, next);

      const [row] = await db
        .update(recoveryLinks)
        .set({
          ...(next.label !== undefined ? { label: next.label } : {}),
          ...(next.url !== undefined ? { url: next.url } : {}),
          ...(next.platform !== undefined ? { platform: next.platform } : {}),
          ...(next.triggerEventType !== undefined ? { triggerEventType: next.triggerEventType } : {}),
          ...(next.productName !== undefined ? { productName: next.productName } : {}),
          ...(parsedBody.data.active !== undefined ? { active: parsedBody.data.active } : {}),
          ...(parsedBody.data.priority !== undefined ? { priority: parsedBody.data.priority } : {}),
          submittedBy:
            requestActorLabel(req) ??
            (parsedBody.data.submittedBy !== undefined
              ? normalizeOptionalText(parsedBody.data.submittedBy)
              : existing.submittedBy),
          ...(shouldResetApproval
            ? {
                approvalStatus: "pending_review" as const,
                approvalNote: null,
                reviewedBy: null,
                reviewedAt: null,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(recoveryLinks.id, linkId), eq(recoveryLinks.tenantId, tenantId)))
        .returning();

      return reply.status(200).send({ ok: true, item: row, approvalReset: shouldResetApproval });
    },
  );

  app.get(
    "/conversion/recovery-links",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const auth = await assertOperationalAccess(req, reply);
      if (!auth) return;

      const parsedQuery = operationalRecoveryLinksQuery.safeParse(req.query ?? {});
      if (!parsedQuery.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_query",
          issues: parsedQuery.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const db = getDb();
      if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });

      const filters = buildOperationalFilters(parsedQuery.data);
      const summaryFilters = buildOperationalFilters(parsedQuery.data, { includeStatus: false });
      const where = filters.length ? and(...filters) : undefined;
      const summaryWhere = summaryFilters.length ? and(...summaryFilters) : undefined;
      const offset = (parsedQuery.data.page - 1) * parsedQuery.data.pageSize;

      const rows = await db
        .select({
          id: recoveryLinks.id,
          createdAt: recoveryLinks.createdAt,
          updatedAt: recoveryLinks.updatedAt,
          tenantId: recoveryLinks.tenantId,
          tenantName: tenants.name,
          label: recoveryLinks.label,
          url: recoveryLinks.url,
          platform: recoveryLinks.platform,
          triggerEventType: recoveryLinks.triggerEventType,
          productName: recoveryLinks.productName,
          active: recoveryLinks.active,
          priority: recoveryLinks.priority,
          approvalStatus: recoveryLinks.approvalStatus,
          approvalNote: recoveryLinks.approvalNote,
          submittedBy: recoveryLinks.submittedBy,
          reviewedBy: recoveryLinks.reviewedBy,
          reviewedAt: recoveryLinks.reviewedAt,
        })
        .from(recoveryLinks)
        .innerJoin(tenants, eq(recoveryLinks.tenantId, tenants.id))
        .where(where)
        .orderBy(desc(recoveryLinks.updatedAt), asc(recoveryLinks.label))
        .limit(parsedQuery.data.pageSize)
        .offset(offset);

      const [countRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(recoveryLinks)
        .innerJoin(tenants, eq(recoveryLinks.tenantId, tenants.id))
        .where(where);

      const summaryRows = await db
        .select({
          status: recoveryLinks.approvalStatus,
          total: sql<number>`count(*)::int`,
        })
        .from(recoveryLinks)
        .innerJoin(tenants, eq(recoveryLinks.tenantId, tenants.id))
        .where(summaryWhere)
        .groupBy(recoveryLinks.approvalStatus);

      const summary = {
        all: summaryRows.reduce((acc, row) => acc + (row.total ?? 0), 0),
        pendingReview: 0,
        approved: 0,
        rejected: 0,
      };
      for (const row of summaryRows) {
        if (row.status === "pending_review") summary.pendingReview = row.total ?? 0;
        if (row.status === "approved") summary.approved = row.total ?? 0;
        if (row.status === "rejected") summary.rejected = row.total ?? 0;
      }

      const total = countRow?.total ?? 0;
      return reply.status(200).send({
        ok: true,
        items: rows,
        pagination: {
          page: parsedQuery.data.page,
          pageSize: parsedQuery.data.pageSize,
          total,
          totalPages: total > 0 ? Math.ceil(total / parsedQuery.data.pageSize) : 1,
        },
        summary,
        filters: {
          status: parsedQuery.data.status ?? null,
          tenantId: parsedQuery.data.tenantId ?? null,
          q: parsedQuery.data.q?.trim() ?? "",
        },
        actor: formatDashboardActorLabel(auth.user),
      });
    },
  );

  app.post<{ Params: { linkId: string }; Body: unknown }>(
    "/conversion/recovery-links/:linkId/approve",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const auth = await assertOperationalAccess(req, reply);
      if (!auth) return;

      const parsedParams = z.object({ linkId: z.string().uuid() }).safeParse(req.params ?? {});
      const parsedBody = adminReviewBody.safeParse(req.body ?? {});
      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({ ok: false, error: "invalid_request" });
      }

      const db = getDb();
      if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });

      const [row] = await db
        .update(recoveryLinks)
        .set({
          approvalStatus: "approved",
          approvalNote: parsedBody.data.approvalNote?.trim() ?? null,
          reviewedBy: parsedBody.data.reviewedBy?.trim() ?? formatDashboardActorLabel(auth.user),
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(recoveryLinks.id, parsedParams.data.linkId))
        .returning();

      if (!row) return reply.status(404).send({ ok: false, error: "recovery_link_not_found" });
      return reply.status(200).send({ ok: true, item: row });
    },
  );

  app.post<{ Params: { linkId: string }; Body: unknown }>(
    "/conversion/recovery-links/:linkId/reject",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const auth = await assertOperationalAccess(req, reply);
      if (!auth) return;

      const parsedParams = z.object({ linkId: z.string().uuid() }).safeParse(req.params ?? {});
      const parsedBody = adminReviewBody.extend({
        approvalNote: z.string().trim().min(1).max(1000),
      }).safeParse(req.body ?? {});
      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({ ok: false, error: "invalid_request" });
      }

      const db = getDb();
      if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });

      const [row] = await db
        .update(recoveryLinks)
        .set({
          approvalStatus: "rejected",
          approvalNote: parsedBody.data.approvalNote.trim(),
          reviewedBy: parsedBody.data.reviewedBy?.trim() ?? formatDashboardActorLabel(auth.user),
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(recoveryLinks.id, parsedParams.data.linkId))
        .returning();

      if (!row) return reply.status(404).send({ ok: false, error: "recovery_link_not_found" });
      return reply.status(200).send({ ok: true, item: row });
    },
  );
};

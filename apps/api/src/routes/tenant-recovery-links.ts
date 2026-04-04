import { and, desc, eq } from "drizzle-orm";
import { recoveryLinks } from "@re/db";
import { RECOVERY_SALES_TRIGGER_EVENTS } from "@re/core";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { assertTenantManagementAccess, isAdminTokenAuthorized } from "../auth/dashboard-auth.js";
import { getDb } from "../db.js";

const paramsTenant = z.object({
  tenantId: z.string().uuid(),
});

const paramsLink = z.object({
  tenantId: z.string().uuid(),
  linkId: z.string().uuid(),
});

const triggerSchema = z.enum(RECOVERY_SALES_TRIGGER_EVENTS as unknown as [string, ...string[]]);

const recoveryLinkBody = z.object({
  label: z.string().min(1).max(200),
  url: z.string().url().max(2000),
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

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requiresReapproval(
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
          submittedBy: normalizeOptionalText(parsedBody.data.submittedBy) ?? req.tenantMembershipRole ?? null,
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
          ...(parsedBody.data.submittedBy !== undefined
            ? { submittedBy: normalizeOptionalText(parsedBody.data.submittedBy) }
            : {}),
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
      if (!isAdminTokenAuthorized(req)) return reply.status(401).send({ ok: false, error: "admin_token_invalid" });

      const tenantId = z
        .object({ tenantId: z.string().uuid().optional(), status: z.enum(["pending_review", "approved", "rejected"]).optional() })
        .safeParse(req.query ?? {});
      if (!tenantId.success) return reply.status(400).send({ ok: false, error: "invalid_query" });

      const db = getDb();
      if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });

      const filters = [];
      if (tenantId.data.tenantId) filters.push(eq(recoveryLinks.tenantId, tenantId.data.tenantId));
      if (tenantId.data.status) filters.push(eq(recoveryLinks.approvalStatus, tenantId.data.status));

      const rows = await db
        .select()
        .from(recoveryLinks)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(recoveryLinks.updatedAt));

      return reply.status(200).send({ ok: true, items: rows });
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
      if (!isAdminTokenAuthorized(req)) return reply.status(401).send({ ok: false, error: "admin_token_invalid" });
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
          reviewedBy: parsedBody.data.reviewedBy?.trim() ?? "admin",
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
      if (!isAdminTokenAuthorized(req)) return reply.status(401).send({ ok: false, error: "admin_token_invalid" });
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
          reviewedBy: parsedBody.data.reviewedBy?.trim() ?? "admin",
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

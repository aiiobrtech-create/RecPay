import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  conversionAttributions,
  messageApprovals,
  messageTemplates,
  messageVariants,
  recoveryAttempts,
  recoveryFlows,
} from "@re/db";
import { CONVERSION_TRIGGER_EVENTS } from "@re/core";
import { enqueueProcessEvent } from "@re/queue";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { getDb } from "../db.js";
import { getEventsQueue } from "../queue-singleton.js";

const tenantIdQuery = z.object({
  tenantId: z.string().uuid(),
});

const flowApprovalSchema = z.enum(["auto", "requires_approval"]);

const triggerEventTypeSchema = z.enum(
  CONVERSION_TRIGGER_EVENTS as unknown as [string, ...string[]],
);

function definedPatch<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function adminTokenFromHeader(req: FastifyRequest): string | null {
  const value = req.headers["x-admin-token"];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function isAdminAuthorized(req: FastifyRequest): { ok: true } | { ok: false; error: string } {
  const expected = process.env.ADMIN_API_TOKEN?.trim();
  if (!expected) return { ok: false, error: "admin_token_not_configured" };
  const provided = adminTokenFromHeader(req)?.trim();
  if (!provided) return { ok: false, error: "admin_token_missing" };
  if (provided !== expected) return { ok: false, error: "admin_token_invalid" };
  return { ok: true };
}

/** Rate limit mais estrito que o global para rotas só com x-admin-token. */
const adminConversionRouteOpts = {
  config: {
    rateLimit: {
      max: 30,
      timeWindow: "1 minute" as const,
    },
  },
};

export const conversionMessagingRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onResponse", async (req, reply) => {
    if (!req.url?.startsWith("/conversion")) return;
    if (reply.statusCode >= 400) return;
    req.log.info(
      { route: req.url, ip: req.ip, status: reply.statusCode },
      "admin_conversion_ok",
    );
  });

  app.get("/conversion/recovery-flows", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const parsed = tenantIdQuery.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid_query" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const rows = await db
      .select()
      .from(recoveryFlows)
      .where(eq(recoveryFlows.tenantId, parsed.data.tenantId))
      .orderBy(desc(recoveryFlows.priority), desc(recoveryFlows.createdAt));
    return { ok: true, items: rows };
  });

  const createFlowBody = z.object({
    tenantId: z.string().uuid(),
    name: z.string().min(1).max(200),
    triggerEventType: triggerEventTypeSchema,
    channel: z.string().max(32).default("whatsapp"),
    delaySeconds: z.coerce.number().int().min(0).max(86400).default(0),
    approvalMode: flowApprovalSchema.default("auto"),
    enabled: z.boolean().default(true),
    priority: z.coerce.number().int().default(0),
    messageTemplateId: z.string().uuid(),
  });

  app.post("/conversion/recovery-flows", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const parsed = createFlowBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid_body" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const [row] = await db
      .insert(recoveryFlows)
      .values({
        tenantId: parsed.data.tenantId,
        name: parsed.data.name,
        triggerEventType: parsed.data.triggerEventType,
        channel: parsed.data.channel,
        delaySeconds: parsed.data.delaySeconds,
        approvalMode: parsed.data.approvalMode,
        enabled: parsed.data.enabled,
        priority: parsed.data.priority,
        messageTemplateId: parsed.data.messageTemplateId,
      })
      .returning();
    return reply.status(201).send({ ok: true, flow: row });
  });

  const patchFlowParams = z.object({ id: z.string().uuid() });
  const patchFlowBody = z.object({
    name: z.string().min(1).max(200).optional(),
    triggerEventType: triggerEventTypeSchema.optional(),
    delaySeconds: z.coerce.number().int().min(0).max(86400).optional(),
    approvalMode: flowApprovalSchema.optional(),
    enabled: z.boolean().optional(),
    priority: z.coerce.number().int().optional(),
    messageTemplateId: z.string().uuid().optional(),
  });

  app.patch("/conversion/recovery-flows/:id", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const params = patchFlowParams.safeParse(req.params);
    const body = patchFlowBody.safeParse(req.body);
    if (!params.success || !body.success) return reply.status(400).send({ ok: false, error: "invalid_request" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const [row] = await db
      .update(recoveryFlows)
      .set({
        ...body.data,
        updatedAt: new Date(),
      })
      .where(eq(recoveryFlows.id, params.data.id))
      .returning();
    if (!row) return reply.status(404).send({ ok: false, error: "not_found" });
    return { ok: true, flow: row };
  });

  app.get("/conversion/message-templates", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const parsed = tenantIdQuery.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid_query" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const rows = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.tenantId, parsed.data.tenantId))
      .orderBy(desc(messageTemplates.createdAt));
    return { ok: true, items: rows };
  });

  const createTemplateBody = z.object({
    tenantId: z.string().uuid(),
    name: z.string().min(1).max(200),
    channel: z.string().max(32).default("whatsapp"),
    body: z.string().min(1).max(8000),
    active: z.boolean().default(true),
  });

  app.post("/conversion/message-templates", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const parsed = createTemplateBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid_body" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const [row] = await db.insert(messageTemplates).values(parsed.data).returning();
    return reply.status(201).send({ ok: true, template: row });
  });

  const patchTemplateParams = z.object({ id: z.string().uuid() });
  const patchTemplateBody = z.object({
    name: z.string().min(1).max(200).optional(),
    body: z.string().min(1).max(8000).optional(),
    active: z.boolean().optional(),
  });

  app.patch("/conversion/message-templates/:id", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const params = patchTemplateParams.safeParse(req.params);
    const body = patchTemplateBody.safeParse(req.body);
    if (!params.success || !body.success) return reply.status(400).send({ ok: false, error: "invalid_request" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const [row] = await db
      .update(messageTemplates)
      .set({ ...definedPatch(body.data as Record<string, unknown>), updatedAt: new Date() })
      .where(eq(messageTemplates.id, params.data.id))
      .returning();
    if (!row) return reply.status(404).send({ ok: false, error: "not_found" });
    return { ok: true, template: row };
  });

  const variantsQuery = z.object({
    tenantId: z.string().uuid(),
    templateId: z.string().uuid(),
  });

  app.get("/conversion/message-variants", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const parsed = variantsQuery.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid_query" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const rows = await db
      .select()
      .from(messageVariants)
      .where(
        and(
          eq(messageVariants.tenantId, parsed.data.tenantId),
          eq(messageVariants.templateId, parsed.data.templateId),
        ),
      )
      .orderBy(desc(messageVariants.createdAt));
    return { ok: true, items: rows };
  });

  const createVariantBody = z.object({
    tenantId: z.string().uuid(),
    templateId: z.string().uuid(),
    label: z.string().min(1).max(120),
    weight: z.coerce.number().int().min(0).max(1000).default(1),
    body: z.string().max(8000).nullable().optional(),
    active: z.boolean().default(true),
  });

  app.post("/conversion/message-variants", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const parsed = createVariantBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid_body" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const [row] = await db
      .insert(messageVariants)
      .values({
        tenantId: parsed.data.tenantId,
        templateId: parsed.data.templateId,
        label: parsed.data.label,
        weight: parsed.data.weight,
        body: parsed.data.body ?? null,
        active: parsed.data.active,
      })
      .returning();
    return reply.status(201).send({ ok: true, variant: row });
  });

  const patchVariantParams = z.object({ id: z.string().uuid() });
  const patchVariantBody = z.object({
    label: z.string().min(1).max(120).optional(),
    weight: z.coerce.number().int().min(0).max(1000).optional(),
    body: z.string().max(8000).nullable().optional(),
    active: z.boolean().optional(),
  });

  app.patch("/conversion/message-variants/:id", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const params = patchVariantParams.safeParse(req.params);
    const body = patchVariantBody.safeParse(req.body);
    if (!params.success || !body.success) return reply.status(400).send({ ok: false, error: "invalid_request" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const [row] = await db
      .update(messageVariants)
      .set(definedPatch(body.data as Record<string, unknown>))
      .where(eq(messageVariants.id, params.data.id))
      .returning();
    if (!row) return reply.status(404).send({ ok: false, error: "not_found" });
    return { ok: true, variant: row };
  });

  const approvalsQuery = z.object({
    tenantId: z.string().uuid(),
    status: z.enum(["pending", "approved", "rejected"]).optional(),
  });

  app.get("/conversion/message-approvals", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const parsed = approvalsQuery.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid_query" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const where = parsed.data.status
      ? and(
          eq(messageApprovals.tenantId, parsed.data.tenantId),
          eq(messageApprovals.status, parsed.data.status),
        )
      : eq(messageApprovals.tenantId, parsed.data.tenantId);
    const rows = await db
      .select()
      .from(messageApprovals)
      .where(where)
      .orderBy(desc(messageApprovals.createdAt))
      .limit(200);
    return { ok: true, items: rows };
  });

  const approvalParams = z.object({ id: z.string().uuid() });
  const approveBody = z.object({
    reviewer: z.string().max(200).optional(),
  });
  const rejectBody = z.object({
    reviewer: z.string().max(200).optional(),
    note: z.string().max(2000).optional(),
  });

  app.post("/conversion/message-approvals/:id/approve", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const params = approvalParams.safeParse(req.params);
    const body = approveBody.safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.status(400).send({ ok: false, error: "invalid_request" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const [approval] = await db
      .select()
      .from(messageApprovals)
      .where(eq(messageApprovals.id, params.data.id))
      .limit(1);
    if (!approval) return reply.status(404).send({ ok: false, error: "not_found" });
    const [updated] = await db
      .update(messageApprovals)
      .set({
        status: "approved",
        resolvedAt: new Date(),
        resolvedBy: body.data.reviewer ?? "admin_api",
      })
      .where(eq(messageApprovals.id, approval.id))
      .returning();
    const [attempt] = await db
      .select()
      .from(recoveryAttempts)
      .where(eq(recoveryAttempts.id, approval.recoveryAttemptId))
      .limit(1);
    const queue = getEventsQueue();
    if (queue && attempt) {
      await enqueueProcessEvent(queue, attempt.eventId, { allowDuplicate: true });
    }
    return { ok: true, approval: updated };
  });

  app.post("/conversion/message-approvals/:id/reject", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const params = approvalParams.safeParse(req.params);
    const body = rejectBody.safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.status(400).send({ ok: false, error: "invalid_request" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const [approval] = await db
      .select()
      .from(messageApprovals)
      .where(eq(messageApprovals.id, params.data.id))
      .limit(1);
    if (!approval) return reply.status(404).send({ ok: false, error: "not_found" });
    const [updated] = await db
      .update(messageApprovals)
      .set({
        status: "rejected",
        resolvedAt: new Date(),
        resolvedBy: body.data.reviewer ?? "admin_api",
        reviewerNote: body.data.note ?? null,
      })
      .where(eq(messageApprovals.id, approval.id))
      .returning();
    const [attempt] = await db
      .select()
      .from(recoveryAttempts)
      .where(eq(recoveryAttempts.id, approval.recoveryAttemptId))
      .limit(1);
    const queue = getEventsQueue();
    if (queue && attempt) {
      await enqueueProcessEvent(queue, attempt.eventId, { allowDuplicate: true });
    }
    return { ok: true, approval: updated };
  });

  const metricsQuery = z.object({
    tenantId: z.string().uuid(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  });

  app.get("/conversion/metrics", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const parsed = metricsQuery.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid_query" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const from = parsed.data.from ? new Date(parsed.data.from) : new Date(Date.now() - 30 * 86400000);
    const to = parsed.data.to ? new Date(parsed.data.to) : new Date();

    const [sentRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(recoveryAttempts)
      .where(
        and(
          eq(recoveryAttempts.tenantId, parsed.data.tenantId),
          gte(recoveryAttempts.createdAt, from),
          lte(recoveryAttempts.createdAt, to),
          inArray(recoveryAttempts.status, ["sent", "simulated_sent"]),
        ),
      );

    const [pendingApprovals] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(messageApprovals)
      .where(
        and(eq(messageApprovals.tenantId, parsed.data.tenantId), eq(messageApprovals.status, "pending")),
      );

    const [attributed] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(conversionAttributions)
      .where(
        and(
          eq(conversionAttributions.tenantId, parsed.data.tenantId),
          gte(conversionAttributions.createdAt, from),
          lte(conversionAttributions.createdAt, to),
        ),
      );

    const sent = sentRow?.total ?? 0;
    const conversions = attributed?.total ?? 0;
    const conversionRate = sent > 0 ? conversions / sent : null;

    return {
      ok: true,
      range: { from: from.toISOString(), to: to.toISOString() },
      sentAttempts: sent,
      pendingApprovals: pendingApprovals?.total ?? 0,
      attributedConversions: conversions,
      conversionRateApprox: conversionRate,
      note: "conversionRateApprox = atribuições / tentativas enviadas no período (proxy para pagamento aprovado atribuído).",
    };
  });

  /** Lista operacional agregada de tentativas + mensagem composta (útil para dashboard). */
  app.get("/conversion/message-attempts", adminConversionRouteOpts, async (req, reply) => {
    const auth = isAdminAuthorized(req);
    if (!auth.ok) return reply.status(401).send({ ok: false, error: auth.error });
    const parsed = z
      .object({
        tenantId: z.string().uuid(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid_query" });
    const db = getDb();
    if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });
    const rows = await db
      .select({
        id: recoveryAttempts.id,
        createdAt: recoveryAttempts.createdAt,
        status: recoveryAttempts.status,
        reason: recoveryAttempts.reason,
        meta: recoveryAttempts.meta,
        eventId: recoveryAttempts.eventId,
      })
      .from(recoveryAttempts)
      .where(eq(recoveryAttempts.tenantId, parsed.data.tenantId))
      .orderBy(desc(recoveryAttempts.createdAt))
      .limit(parsed.data.limit);
    return {
      ok: true,
      items: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        composedPreview:
          r.meta &&
          typeof r.meta === "object" &&
          !Array.isArray(r.meta) &&
          typeof (r.meta as Record<string, unknown>).messaging === "object" &&
          (r.meta as Record<string, unknown>).messaging !== null
            ? String(((((r.meta as Record<string, unknown>).messaging as Record<string, unknown>)[
                "composedBody"
              ] as string) ?? "").slice(0, 400))
            : null,
      })),
    };
  });
};

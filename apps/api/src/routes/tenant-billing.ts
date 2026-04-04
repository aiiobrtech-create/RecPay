import { and, desc, eq } from "drizzle-orm";
import { billingStatements, chargeAttempts, tenants } from "@re/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { assertTenantManagementAccess } from "../auth/dashboard-auth.js";
import { getDb } from "../db.js";
import {
  closeBillingCycle,
  previewBillingStatement,
  resolveClosedBillingPeriod,
  retryStatementCharge,
} from "../lib/success-fee-billing.js";

const paramsSchema = z.object({
  tenantId: z.string().uuid(),
});

const dateSchema = z.string().datetime({ offset: true }).transform((value) => new Date(value));

const previewQuerySchema = z.object({
  periodStart: dateSchema.optional(),
  periodEnd: dateSchema.optional(),
});

const closeBodySchema = z.object({
  periodStart: dateSchema.optional(),
  periodEnd: dateSchema.optional(),
  chargeNow: z.boolean().optional(),
});

const retryParamsSchema = z.object({
  tenantId: z.string().uuid(),
  statementId: z.string().uuid(),
});

export const tenantBillingRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { tenantId: string }; Querystring: Record<string, string | undefined> }>(
    "/admin/tenants/:tenantId/billing/preview",
    async (req, reply) => {
      const parsedParams = paramsSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) {
        return reply.status(400).send({ ok: false, error: "invalid_params" });
      }
      const tenantId = parsedParams.data.tenantId;
      const accessOk = await assertTenantManagementAccess(req, reply, tenantId, { allowReadonly: true });
      if (!accessOk) return;

      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }

      const parsedQuery = previewQuerySchema.safeParse(req.query ?? {});
      if (!parsedQuery.success) {
        return reply.status(400).send({ ok: false, error: "invalid_query" });
      }

      const [tenant] = await db
        .select({ billingCycleAnchorDay: tenants.billingCycleAnchorDay })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        return reply.status(404).send({ ok: false, error: "tenant_not_found" });
      }

      const period =
        parsedQuery.data.periodStart && parsedQuery.data.periodEnd
          ? { periodStart: parsedQuery.data.periodStart, periodEnd: parsedQuery.data.periodEnd }
          : resolveClosedBillingPeriod(new Date(), tenant.billingCycleAnchorDay);

      const preview = await previewBillingStatement({
        db,
        tenantId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      });

      return reply.status(200).send({ ok: true, preview });
    },
  );

  app.get<{ Params: { tenantId: string } }>("/admin/tenants/:tenantId/billing/statements", async (req, reply) => {
    const parsedParams = paramsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) {
      return reply.status(400).send({ ok: false, error: "invalid_params" });
    }
    const tenantId = parsedParams.data.tenantId;
    const accessOk = await assertTenantManagementAccess(req, reply, tenantId, { allowReadonly: true });
    if (!accessOk) return;

    const db = getDb();
    if (!db) {
      return reply.status(503).send({ ok: false, error: "database_unavailable" });
    }

    const rows = await db
      .select({
        id: billingStatements.id,
        periodStart: billingStatements.periodStart,
        periodEnd: billingStatements.periodEnd,
        recoveredTotalCents: billingStatements.recoveredTotalCents,
        commissionTotalCents: billingStatements.commissionTotalCents,
        monthlyFeeCents: billingStatements.monthlyFeeCents,
        grandTotalCents: billingStatements.grandTotalCents,
        status: billingStatements.status,
        chargedAt: billingStatements.chargedAt,
      })
      .from(billingStatements)
      .where(eq(billingStatements.tenantId, tenantId))
      .orderBy(desc(billingStatements.periodEnd))
      .limit(24);

    return reply.status(200).send({
      ok: true,
      items: rows.map((row) => ({
        ...row,
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        chargedAt: row.chargedAt?.toISOString() ?? null,
      })),
    });
  });

  app.post<{ Params: { tenantId: string }; Body: Record<string, unknown> }>(
    "/admin/tenants/:tenantId/billing/close-cycle",
    async (req, reply) => {
      const parsedParams = paramsSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) {
        return reply.status(400).send({ ok: false, error: "invalid_params" });
      }
      const tenantId = parsedParams.data.tenantId;
      const accessOk = await assertTenantManagementAccess(req, reply, tenantId);
      if (!accessOk) return;

      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }

      const parsedBody = closeBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({ ok: false, error: "invalid_body" });
      }

      const [tenant] = await db
        .select({ billingCycleAnchorDay: tenants.billingCycleAnchorDay })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        return reply.status(404).send({ ok: false, error: "tenant_not_found" });
      }

      const period =
        parsedBody.data.periodStart && parsedBody.data.periodEnd
          ? { periodStart: parsedBody.data.periodStart, periodEnd: parsedBody.data.periodEnd }
          : resolveClosedBillingPeriod(new Date(), tenant.billingCycleAnchorDay);

      try {
        const result = await closeBillingCycle({
          db,
          tenantId,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          chargeNow: parsedBody.data.chargeNow ?? true,
        });
        return reply.status(result.duplicate ? 200 : 201).send({ ok: true, ...result });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg === "stripe_not_configured") {
          return reply.status(503).send({ ok: false, error: "stripe_not_configured" });
        }
        return reply.status(500).send({ ok: false, error: "close_cycle_failed", message: msg });
      }
    },
  );

  app.post<{ Params: { tenantId: string; statementId: string } }>(
    "/admin/tenants/:tenantId/billing/statements/:statementId/retry-charge",
    async (req, reply) => {
      const parsedParams = retryParamsSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) {
        return reply.status(400).send({ ok: false, error: "invalid_params" });
      }
      const { tenantId, statementId } = parsedParams.data;
      const accessOk = await assertTenantManagementAccess(req, reply, tenantId);
      if (!accessOk) return;

      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }

      const [statement] = await db
        .select({ id: billingStatements.id })
        .from(billingStatements)
        .where(and(eq(billingStatements.id, statementId), eq(billingStatements.tenantId, tenantId)))
        .limit(1);
      if (!statement) {
        return reply.status(404).send({ ok: false, error: "statement_not_found" });
      }

      try {
        const result = await retryStatementCharge({ db, statementId });
        return reply.status(200).send({ ok: true, statementId, ...result });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg === "stripe_not_configured") {
          return reply.status(503).send({ ok: false, error: "stripe_not_configured" });
        }
        return reply.status(500).send({ ok: false, error: "retry_charge_failed", message: msg });
      }
    },
  );

  app.get<{ Params: { tenantId: string; statementId: string } }>(
    "/admin/tenants/:tenantId/billing/statements/:statementId/charges",
    async (req, reply) => {
      const parsedParams = retryParamsSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) {
        return reply.status(400).send({ ok: false, error: "invalid_params" });
      }
      const { tenantId, statementId } = parsedParams.data;
      const accessOk = await assertTenantManagementAccess(req, reply, tenantId, { allowReadonly: true });
      if (!accessOk) return;

      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }

      const rows = await db
        .select({
          id: chargeAttempts.id,
          externalChargeId: chargeAttempts.externalChargeId,
          amountCents: chargeAttempts.amountCents,
          status: chargeAttempts.status,
          failureReason: chargeAttempts.failureReason,
          attemptedAt: chargeAttempts.attemptedAt,
        })
        .from(chargeAttempts)
        .innerJoin(billingStatements, eq(chargeAttempts.billingStatementId, billingStatements.id))
        .where(and(eq(chargeAttempts.billingStatementId, statementId), eq(billingStatements.tenantId, tenantId)))
        .orderBy(desc(chargeAttempts.attemptedAt));

      return reply.status(200).send({
        ok: true,
        items: rows.map((row) => ({
          ...row,
          attemptedAt: row.attemptedAt.toISOString(),
        })),
      });
    },
  );
};

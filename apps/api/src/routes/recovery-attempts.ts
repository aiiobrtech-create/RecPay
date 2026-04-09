import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { DashboardOverviewResponse } from "@re/core";
import { enqueueProcessEvent } from "@re/queue";
import { events, recoveryAttempts, sql, tenants, type DbClient } from "@re/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { dashboardTenantPreHandler, tenantOrReply } from "../auth/dashboard-auth.js";
import { getDb } from "../db.js";
import { getEventsQueue } from "../queue-singleton.js";

const querySchema = z.object({
  tenantId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.enum(["scheduled", "simulated_sent", "sent", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().datetime().optional(),
});

const tenantQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

const summaryQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const usageQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

const usageAlertsQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  warningThreshold: z.coerce.number().min(0).max(1).default(0.8),
});

const usageTimeseriesQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const kpisQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const overviewQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  warningThreshold: z.coerce.number().min(0).max(1).default(0.8),
});

const retryParamsSchema = z.object({
  attemptId: z.string().uuid(),
});

const eventParamsSchema = z.object({
  eventId: z.string().uuid(),
});

function mergeMeta(base: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  if (!base || typeof base !== "object" || Array.isArray(base)) return patch;
  return { ...(base as Record<string, unknown>), ...patch };
}

function readManualRetryMeta(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const retry = (meta as Record<string, unknown>).retry;
  if (!retry || typeof retry !== "object" || Array.isArray(retry)) return null;
  return retry as Record<string, unknown>;
}

function hasManualRetryBeenUsed(meta: unknown): boolean {
  const retry = readManualRetryMeta(meta);
  if (!retry) return false;
  const requestedAt = retry.requestedAt;
  const origin = retry.origin;
  return (
    (typeof requestedAt === "string" && requestedAt.trim().length > 0) ||
    (typeof origin === "string" && origin.includes("manual"))
  );
}

function toResponseItem(
  item: {
    id: string;
    createdAt: Date;
    tenantId: string;
    eventId: string;
    channel: string;
    status: "scheduled" | "simulated_sent" | "sent" | "failed";
    reason: string | null;
    meta: Record<string, unknown> | null;
    executedAt: Date | null;
  },
) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    executedAt: item.executedAt ? item.executedAt.toISOString() : null,
  };
}

function startOfCurrentUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

async function loadTenantMonthlyUsage(db: DbClient, tenantId: string) {
  const monthStart = startOfCurrentUtcMonth();

  const [tenant] = await db
    .select({
      id: tenants.id,
      planMonthlyEventsLimit: tenants.planMonthlyEventsLimit,
      planMonthlyRecoveryLimit: tenants.planMonthlyRecoveryLimit,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) return null;

  const [eventsCount] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), gte(events.createdAt, monthStart)));

  const [recoveryCount] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(recoveryAttempts)
    .where(and(eq(recoveryAttempts.tenantId, tenantId), gte(recoveryAttempts.createdAt, monthStart)));

  const usedEvents = eventsCount?.total ?? 0;
  const usedRecovery = recoveryCount?.total ?? 0;
  const eventsLimit = tenant.planMonthlyEventsLimit;
  const recoveryLimit = tenant.planMonthlyRecoveryLimit;

  return {
    monthStart,
    tenantId,
    usage: {
      events: {
        used: usedEvents,
        limit: eventsLimit,
        unlimited: eventsLimit === null,
        remaining: eventsLimit === null ? null : Math.max(eventsLimit - usedEvents, 0),
        utilizationRate:
          eventsLimit && eventsLimit > 0 ? Number((usedEvents / eventsLimit).toFixed(4)) : null,
      },
      recoveryAttempts: {
        used: usedRecovery,
        limit: recoveryLimit,
        unlimited: recoveryLimit === null,
        remaining: recoveryLimit === null ? null : Math.max(recoveryLimit - usedRecovery, 0),
        utilizationRate:
          recoveryLimit && recoveryLimit > 0
            ? Number((usedRecovery / recoveryLimit).toFixed(4))
            : null,
      },
    },
  };
}

function usageStatus(
  utilizationRate: number | null,
  warningThreshold: number,
): "normal" | "warning" | "exceeded" | "unlimited" {
  if (utilizationRate === null) return "unlimited";
  if (utilizationRate >= 1) return "exceeded";
  if (utilizationRate >= warningThreshold) return "warning";
  return "normal";
}

function toUtcDayStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0));
}

function toIsoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function percentage(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

export const recoveryAttemptsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    await dashboardTenantPreHandler(req, reply);
  });

  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/dashboard/overview",
    {
      config: {
        rateLimit: {
          max: 180,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }
      const parsed = overviewQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_query",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const tenantId = tenantOrReply(req, reply, parsed.data.tenantId);
      if (!tenantId) return;

      const { warningThreshold } = parsed.data;
      const now = new Date();
      const defaultFrom = startOfCurrentUtcMonth();
      const fromRaw = parsed.data.from ? new Date(parsed.data.from) : defaultFrom;
      const toRaw = parsed.data.to ? new Date(parsed.data.to) : now;
      const rangeFrom = toUtcDayStart(fromRaw);
      const rangeTo = toUtcDayStart(toRaw);

      if (rangeFrom.getTime() > rangeTo.getTime()) {
        return reply.status(400).send({ ok: false, error: "invalid_range" });
      }

      const usageLoaded = await loadTenantMonthlyUsage(db, tenantId);
      if (!usageLoaded) {
        return reply.status(404).send({ ok: false, error: "tenant_not_found" });
      }

      // Summary
      const summaryRows = await db
        .select({
          status: recoveryAttempts.status,
          total: sql<number>`count(*)::int`,
        })
        .from(recoveryAttempts)
        .where(
          and(
            eq(recoveryAttempts.tenantId, tenantId),
            gte(recoveryAttempts.createdAt, rangeFrom),
            lte(recoveryAttempts.createdAt, new Date(rangeTo.getTime() + 86_399_999)),
          ),
        )
        .groupBy(recoveryAttempts.status);

      const summaryByStatus = {
        scheduled: 0,
        simulated_sent: 0,
        sent: 0,
        failed: 0,
      };
      for (const row of summaryRows) {
        if (row.status in summaryByStatus) {
          summaryByStatus[row.status as keyof typeof summaryByStatus] = row.total;
        }
      }
      const summaryTotal =
        summaryByStatus.scheduled +
        summaryByStatus.simulated_sent +
        summaryByStatus.sent +
        summaryByStatus.failed;
      const summaryDelivered = summaryByStatus.sent + summaryByStatus.simulated_sent;
      const summaryDeliveryRate = summaryTotal > 0 ? Number((summaryDelivered / summaryTotal).toFixed(4)) : 0;

      // Timeseries
      const daysSpan = Math.floor((rangeTo.getTime() - rangeFrom.getTime()) / 86_400_000) + 1;
      if (daysSpan > 120) {
        return reply.status(400).send({ ok: false, error: "range_too_large", maxDays: 120 });
      }

      const eventDay = sql<string>`to_char(date_trunc('day', ${events.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
      const recoveryDay =
        sql<string>`to_char(date_trunc('day', ${recoveryAttempts.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;

      const eventRows = await db
        .select({
          day: eventDay,
          total: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(
          and(
            eq(events.tenantId, tenantId),
            gte(events.createdAt, rangeFrom),
            lte(events.createdAt, new Date(rangeTo.getTime() + 86_399_999)),
          ),
        )
        .groupBy(eventDay)
        .orderBy(eventDay);

      const recoveryRows = await db
        .select({
          day: recoveryDay,
          total: sql<number>`count(*)::int`,
        })
        .from(recoveryAttempts)
        .where(
          and(
            eq(recoveryAttempts.tenantId, tenantId),
            gte(recoveryAttempts.createdAt, rangeFrom),
            lte(recoveryAttempts.createdAt, new Date(rangeTo.getTime() + 86_399_999)),
          ),
        )
        .groupBy(recoveryDay)
        .orderBy(recoveryDay);

      const eventsByDay = new Map(eventRows.map((r) => [r.day, r.total]));
      const recoveryByDay = new Map(recoveryRows.map((r) => [r.day, r.total]));
      const points: Array<{ day: string; events: number; recoveryAttempts: number }> = [];
      for (let t = rangeFrom.getTime(); t <= rangeTo.getTime(); t += 86_400_000) {
        const day = toIsoDay(new Date(t));
        points.push({
          day,
          events: eventsByDay.get(day) ?? 0,
          recoveryAttempts: recoveryByDay.get(day) ?? 0,
        });
      }

      // KPIs
      const [eventsTotalRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(events)
        .where(
          and(
            eq(events.tenantId, tenantId),
            gte(events.createdAt, rangeFrom),
            lte(events.createdAt, new Date(rangeTo.getTime() + 86_399_999)),
          ),
        );
      const [failedEventsRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(events)
        .where(
          and(
            eq(events.tenantId, tenantId),
            gte(events.createdAt, rangeFrom),
            lte(events.createdAt, new Date(rangeTo.getTime() + 86_399_999)),
            sql`(canonical ->> 'eventType') = 'payment_failed'`,
          ),
        );
      const [attemptsTotalRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(recoveryAttempts)
        .where(
          and(
            eq(recoveryAttempts.tenantId, tenantId),
            gte(recoveryAttempts.createdAt, rangeFrom),
            lte(recoveryAttempts.createdAt, new Date(rangeTo.getTime() + 86_399_999)),
          ),
        );
      const [attemptsDeliveredRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(recoveryAttempts)
        .where(
          and(
            eq(recoveryAttempts.tenantId, tenantId),
            gte(recoveryAttempts.createdAt, rangeFrom),
            lte(recoveryAttempts.createdAt, new Date(rangeTo.getTime() + 86_399_999)),
            sql`${recoveryAttempts.status} in ('sent','simulated_sent')`,
          ),
        );

      const last7From = new Date(rangeTo.getTime() - 7 * 86_400_000);
      const prev7From = new Date(rangeTo.getTime() - 14 * 86_400_000);
      const prev7To = new Date(rangeTo.getTime() - 7 * 86_400_000);

      const [eventsLast7Row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(events)
        .where(and(eq(events.tenantId, tenantId), gte(events.createdAt, last7From), lte(events.createdAt, rangeTo)));

      const [eventsPrev7Row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(events)
        .where(and(eq(events.tenantId, tenantId), gte(events.createdAt, prev7From), lte(events.createdAt, prev7To)));

      const [attemptsLast7Row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(recoveryAttempts)
        .where(
          and(
            eq(recoveryAttempts.tenantId, tenantId),
            gte(recoveryAttempts.createdAt, last7From),
            lte(recoveryAttempts.createdAt, rangeTo),
          ),
        );

      const [attemptsPrev7Row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(recoveryAttempts)
        .where(
          and(
            eq(recoveryAttempts.tenantId, tenantId),
            gte(recoveryAttempts.createdAt, prev7From),
            lte(recoveryAttempts.createdAt, prev7To),
          ),
        );

      const eventsTotal = eventsTotalRow?.total ?? 0;
      const failedEvents = failedEventsRow?.total ?? 0;
      const attemptsTotal = attemptsTotalRow?.total ?? 0;
      const attemptsDelivered = attemptsDeliveredRow?.total ?? 0;

      const eventsLast7 = eventsLast7Row?.total ?? 0;
      const eventsPrev7 = eventsPrev7Row?.total ?? 0;
      const attemptsLast7 = attemptsLast7Row?.total ?? 0;
      const attemptsPrev7 = attemptsPrev7Row?.total ?? 0;

      const eventsStatus = usageStatus(usageLoaded.usage.events.utilizationRate, warningThreshold);
      const recoveryStatus = usageStatus(usageLoaded.usage.recoveryAttempts.utilizationRate, warningThreshold);

      const overview: DashboardOverviewResponse = {
        ok: true,
        tenantId,
        range: {
          from: rangeFrom.toISOString(),
          to: new Date(rangeTo.getTime() + 86_399_999).toISOString(),
          days: daysSpan,
        },
        summary: {
          totals: {
            total: summaryTotal,
            delivered: summaryDelivered,
            failed: summaryByStatus.failed,
            scheduled: summaryByStatus.scheduled,
            deliveryRate: summaryDeliveryRate,
          },
          byStatus: summaryByStatus,
        },
        usage: {
          period: { monthStart: usageLoaded.monthStart.toISOString() },
          usage: usageLoaded.usage,
        },
        usageAlerts: {
          warningThreshold,
          hasAnyAlert:
            eventsStatus === "warning" ||
            eventsStatus === "exceeded" ||
            recoveryStatus === "warning" ||
            recoveryStatus === "exceeded",
          alerts: {
            events: { status: eventsStatus, ...usageLoaded.usage.events },
            recoveryAttempts: {
              status: recoveryStatus,
              ...usageLoaded.usage.recoveryAttempts,
            },
          },
        },
        timeseries: {
          points,
        },
        kpis: {
          eventsTotal,
          failedPaymentEvents: failedEvents,
          failureRate: percentage(failedEvents, eventsTotal),
          recoveryAttemptsTotal: attemptsTotal,
          recoveryDeliveredTotal: attemptsDelivered,
          deliveryRate: percentage(attemptsDelivered, attemptsTotal),
        },
        trend7d: {
          events: {
            current: eventsLast7,
            previous: eventsPrev7,
            delta: eventsLast7 - eventsPrev7,
          },
          recoveryAttempts: {
            current: attemptsLast7,
            previous: attemptsPrev7,
            delta: attemptsLast7 - attemptsPrev7,
          },
        },
      };

      return reply.status(200).send(overview);
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/recovery-attempts/usage",
    {
      config: {
        rateLimit: {
          max: 180,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }
      const parsed = usageQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_query",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const tenantId = tenantOrReply(req, reply, parsed.data.tenantId);
      if (!tenantId) return;

      const loaded = await loadTenantMonthlyUsage(db, tenantId);
      if (!loaded) {
        return reply.status(404).send({ ok: false, error: "tenant_not_found" });
      }

      return reply.status(200).send({
        ok: true,
        tenantId,
        period: {
          monthStart: loaded.monthStart.toISOString(),
        },
        usage: loaded.usage,
      });
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/recovery-attempts/usage-alerts",
    {
      config: {
        rateLimit: {
          max: 180,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }
      const parsed = usageAlertsQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_query",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const tenantId = tenantOrReply(req, reply, parsed.data.tenantId);
      if (!tenantId) return;

      const { warningThreshold } = parsed.data;
      const loaded = await loadTenantMonthlyUsage(db, tenantId);
      if (!loaded) {
        return reply.status(404).send({ ok: false, error: "tenant_not_found" });
      }

      const eventsStatus = usageStatus(loaded.usage.events.utilizationRate, warningThreshold);
      const recoveryStatus = usageStatus(
        loaded.usage.recoveryAttempts.utilizationRate,
        warningThreshold,
      );

      return reply.status(200).send({
        ok: true,
        tenantId,
        period: {
          monthStart: loaded.monthStart.toISOString(),
        },
        warningThreshold,
        alerts: {
          events: {
            status: eventsStatus,
            ...loaded.usage.events,
          },
          recoveryAttempts: {
            status: recoveryStatus,
            ...loaded.usage.recoveryAttempts,
          },
        },
        hasAnyAlert:
          eventsStatus === "warning" ||
          eventsStatus === "exceeded" ||
          recoveryStatus === "warning" ||
          recoveryStatus === "exceeded",
      });
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/recovery-attempts/usage-timeseries",
    {
      config: {
        rateLimit: {
          max: 180,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }
      const parsed = usageTimeseriesQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_query",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const tenantId = tenantOrReply(req, reply, parsed.data.tenantId);
      if (!tenantId) return;

      const defaultFrom = startOfCurrentUtcMonth();
      const defaultTo = new Date();
      const fromRaw = parsed.data.from ? new Date(parsed.data.from) : defaultFrom;
      const toRaw = parsed.data.to ? new Date(parsed.data.to) : defaultTo;
      const from = toUtcDayStart(fromRaw);
      const to = toUtcDayStart(toRaw);

      if (from.getTime() > to.getTime()) {
        return reply.status(400).send({ ok: false, error: "invalid_range" });
      }

      const daysSpan = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
      if (daysSpan > 120) {
        return reply.status(400).send({ ok: false, error: "range_too_large", maxDays: 120 });
      }

      const eventDay = sql<string>`to_char(date_trunc('day', ${events.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
      const recoveryDay =
        sql<string>`to_char(date_trunc('day', ${recoveryAttempts.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;

      const eventRows = await db
        .select({
          day: eventDay,
          total: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(
          and(
            eq(events.tenantId, tenantId),
            gte(events.createdAt, from),
            lte(events.createdAt, new Date(to.getTime() + 86_399_999)),
          ),
        )
        .groupBy(eventDay)
        .orderBy(eventDay);

      const recoveryRows = await db
        .select({
          day: recoveryDay,
          total: sql<number>`count(*)::int`,
        })
        .from(recoveryAttempts)
        .where(
          and(
            eq(recoveryAttempts.tenantId, tenantId),
            gte(recoveryAttempts.createdAt, from),
            lte(recoveryAttempts.createdAt, new Date(to.getTime() + 86_399_999)),
          ),
        )
        .groupBy(recoveryDay)
        .orderBy(recoveryDay);

      const eventsByDay = new Map(eventRows.map((r) => [r.day, r.total]));
      const recoveryByDay = new Map(recoveryRows.map((r) => [r.day, r.total]));

      const points: Array<{
        day: string;
        events: number;
        recoveryAttempts: number;
      }> = [];

      for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) {
        const day = toIsoDay(new Date(t));
        points.push({
          day,
          events: eventsByDay.get(day) ?? 0,
          recoveryAttempts: recoveryByDay.get(day) ?? 0,
        });
      }

      return reply.status(200).send({
        ok: true,
        tenantId,
        range: {
          from: from.toISOString(),
          to: new Date(to.getTime() + 86_399_999).toISOString(),
          days: daysSpan,
        },
        points,
      });
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/recovery-attempts/kpis",
    {
      config: {
        rateLimit: {
          max: 180,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }
      const parsed = kpisQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_query",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const tenantId = tenantOrReply(req, reply, parsed.data.tenantId);
      if (!tenantId) return;

      const defaultFrom = new Date(Date.now() - 30 * 86_400_000);
      const defaultTo = new Date();
      const from = parsed.data.from ? new Date(parsed.data.from) : defaultFrom;
      const to = parsed.data.to ? new Date(parsed.data.to) : defaultTo;

      if (from.getTime() > to.getTime()) {
        return reply.status(400).send({ ok: false, error: "invalid_range" });
      }

      const [eventsTotalRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(events)
        .where(and(eq(events.tenantId, tenantId), gte(events.createdAt, from), lte(events.createdAt, to)));

      const [failedEventsRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(events)
        .where(
          and(
            eq(events.tenantId, tenantId),
            gte(events.createdAt, from),
            lte(events.createdAt, to),
            sql`(canonical ->> 'eventType') = 'payment_failed'`,
          ),
        );

      const [attemptsTotalRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(recoveryAttempts)
        .where(
          and(
            eq(recoveryAttempts.tenantId, tenantId),
            gte(recoveryAttempts.createdAt, from),
            lte(recoveryAttempts.createdAt, to),
          ),
        );

      const [attemptsDeliveredRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(recoveryAttempts)
        .where(
          and(
            eq(recoveryAttempts.tenantId, tenantId),
            gte(recoveryAttempts.createdAt, from),
            lte(recoveryAttempts.createdAt, to),
            sql`${recoveryAttempts.status} in ('sent','simulated_sent')`,
          ),
        );

      const last7From = new Date(to.getTime() - 7 * 86_400_000);
      const prev7From = new Date(to.getTime() - 14 * 86_400_000);
      const prev7To = new Date(to.getTime() - 7 * 86_400_000);

      const [eventsLast7Row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(events)
        .where(
          and(eq(events.tenantId, tenantId), gte(events.createdAt, last7From), lte(events.createdAt, to)),
        );

      const [eventsPrev7Row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(events)
        .where(
          and(
            eq(events.tenantId, tenantId),
            gte(events.createdAt, prev7From),
            lte(events.createdAt, prev7To),
          ),
        );

      const [attemptsLast7Row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(recoveryAttempts)
        .where(
          and(
            eq(recoveryAttempts.tenantId, tenantId),
            gte(recoveryAttempts.createdAt, last7From),
            lte(recoveryAttempts.createdAt, to),
          ),
        );

      const [attemptsPrev7Row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(recoveryAttempts)
        .where(
          and(
            eq(recoveryAttempts.tenantId, tenantId),
            gte(recoveryAttempts.createdAt, prev7From),
            lte(recoveryAttempts.createdAt, prev7To),
          ),
        );

      const eventsTotal = eventsTotalRow?.total ?? 0;
      const failedEvents = failedEventsRow?.total ?? 0;
      const attemptsTotal = attemptsTotalRow?.total ?? 0;
      const attemptsDelivered = attemptsDeliveredRow?.total ?? 0;

      const eventsLast7 = eventsLast7Row?.total ?? 0;
      const eventsPrev7 = eventsPrev7Row?.total ?? 0;
      const attemptsLast7 = attemptsLast7Row?.total ?? 0;
      const attemptsPrev7 = attemptsPrev7Row?.total ?? 0;

      return reply.status(200).send({
        ok: true,
        tenantId,
        range: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
        kpis: {
          eventsTotal,
          failedPaymentEvents: failedEvents,
          failureRate: percentage(failedEvents, eventsTotal),
          recoveryAttemptsTotal: attemptsTotal,
          recoveryDeliveredTotal: attemptsDelivered,
          deliveryRate: percentage(attemptsDelivered, attemptsTotal),
        },
        trend7d: {
          events: {
            current: eventsLast7,
            previous: eventsPrev7,
            delta: eventsLast7 - eventsPrev7,
          },
          recoveryAttempts: {
            current: attemptsLast7,
            previous: attemptsPrev7,
            delta: attemptsLast7 - attemptsPrev7,
          },
        },
      });
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/recovery-attempts/summary",
    {
      config: {
        rateLimit: {
          max: 180,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }
      const parsed = summaryQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_query",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const q = parsed.data;
      const tenantId = tenantOrReply(req, reply, q.tenantId);
      if (!tenantId) return;

      const where = [eq(recoveryAttempts.tenantId, tenantId)];
      if (q.from) where.push(gte(recoveryAttempts.createdAt, new Date(q.from)));
      if (q.to) where.push(lte(recoveryAttempts.createdAt, new Date(q.to)));

      const rows = await db
        .select({
          status: recoveryAttempts.status,
          total: sql<number>`count(*)::int`,
        })
        .from(recoveryAttempts)
        .where(and(...where))
        .groupBy(recoveryAttempts.status);

      const byStatus = {
        scheduled: 0,
        simulated_sent: 0,
        sent: 0,
        failed: 0,
      };

      for (const row of rows) {
        if (row.status in byStatus) {
          byStatus[row.status as keyof typeof byStatus] = row.total;
        }
      }

      const total =
        byStatus.scheduled + byStatus.simulated_sent + byStatus.sent + byStatus.failed;
      const delivered = byStatus.sent + byStatus.simulated_sent;
      const deliveryRate = total > 0 ? Number((delivered / total).toFixed(4)) : 0;

      return reply.status(200).send({
        ok: true,
        tenantId,
        filters: {
          from: q.from ?? null,
          to: q.to ?? null,
        },
        totals: {
          total,
          delivered,
          failed: byStatus.failed,
          scheduled: byStatus.scheduled,
          deliveryRate,
        },
        byStatus,
      });
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/recovery-attempts",
    {
      config: {
        rateLimit: {
          max: 180,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }

      const parsed = querySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_query",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const q = parsed.data;
      const tenantId = tenantOrReply(req, reply, q.tenantId);
      if (!tenantId) return;

      const where = [eq(recoveryAttempts.tenantId, tenantId)];

      if (q.status) where.push(eq(recoveryAttempts.status, q.status));
      if (q.from) where.push(gte(recoveryAttempts.createdAt, new Date(q.from)));
      if (q.to) where.push(lte(recoveryAttempts.createdAt, new Date(q.to)));
      if (q.cursor) where.push(lte(recoveryAttempts.createdAt, new Date(q.cursor)));

      const rows = await db
        .select({
          id: recoveryAttempts.id,
          createdAt: recoveryAttempts.createdAt,
          tenantId: recoveryAttempts.tenantId,
          eventId: recoveryAttempts.eventId,
          channel: recoveryAttempts.channel,
          status: recoveryAttempts.status,
          reason: recoveryAttempts.reason,
          meta: recoveryAttempts.meta,
          executedAt: recoveryAttempts.executedAt,
        })
        .from(recoveryAttempts)
        .where(and(...where))
        .orderBy(desc(recoveryAttempts.createdAt))
        .limit(q.limit + 1);

      const hasMore = rows.length > q.limit;
      const items = hasMore ? rows.slice(0, q.limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt?.toISOString() ?? null : null;

      return reply.status(200).send({
        ok: true,
        tenantId,
        filters: {
          from: q.from ?? null,
          to: q.to ?? null,
          status: q.status ?? null,
          limit: q.limit,
          cursor: q.cursor ?? null,
        },
        page: {
          hasMore,
          nextCursor,
        },
        items: items.map(toResponseItem),
      });
    },
  );

  app.get<{ Params: { eventId: string }; Querystring: Record<string, string | undefined> }>(
    "/recovery-attempts/event/:eventId",
    async (req, reply) => {
      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }

      const paramsParsed = eventParamsSchema.safeParse(req.params ?? {});
      const queryParsed = tenantQuerySchema.safeParse(req.query ?? {});
      if (!paramsParsed.success || !queryParsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid_query_or_params" });
      }

      const { eventId } = paramsParsed.data;
      const tenantId = tenantOrReply(req, reply, queryParsed.data.tenantId);
      if (!tenantId) return;

      const [event] = await db
        .select({
          id: events.id,
          createdAt: events.createdAt,
          tenantId: events.tenantId,
          provider: events.provider,
          status: events.status,
          payloadHash: events.payloadHash,
          canonical: events.canonical,
        })
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.tenantId, tenantId)))
        .limit(1);

      if (!event) return reply.status(404).send({ ok: false, error: "event_not_found" });

      const attempts = await db
        .select({
          id: recoveryAttempts.id,
          createdAt: recoveryAttempts.createdAt,
          tenantId: recoveryAttempts.tenantId,
          eventId: recoveryAttempts.eventId,
          channel: recoveryAttempts.channel,
          status: recoveryAttempts.status,
          reason: recoveryAttempts.reason,
          meta: recoveryAttempts.meta,
          executedAt: recoveryAttempts.executedAt,
        })
        .from(recoveryAttempts)
        .where(and(eq(recoveryAttempts.eventId, eventId), eq(recoveryAttempts.tenantId, tenantId)))
        .orderBy(desc(recoveryAttempts.createdAt));

      return reply.status(200).send({
        ok: true,
        tenantId,
        event: {
          ...event,
          createdAt: event.createdAt.toISOString(),
        },
        attempts: attempts.map(toResponseItem),
      });
    },
  );

  app.post<{ Params: { attemptId: string }; Querystring: Record<string, string | undefined> }>(
    "/recovery-attempts/:attemptId/retry",
    async (req, reply) => {
      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }
      const queue = getEventsQueue();
      if (!queue) {
        return reply.status(503).send({ ok: false, error: "redis_unavailable" });
      }

      const paramsParsed = retryParamsSchema.safeParse(req.params ?? {});
      const queryParsed = tenantQuerySchema.safeParse(req.query ?? {});
      if (!paramsParsed.success || !queryParsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid_query_or_params" });
      }

      const { attemptId } = paramsParsed.data;
      const tenantId = tenantOrReply(req, reply, queryParsed.data.tenantId);
      if (!tenantId) return;

      const [attempt] = await db
        .select({
          id: recoveryAttempts.id,
          eventId: recoveryAttempts.eventId,
          status: recoveryAttempts.status,
          meta: recoveryAttempts.meta,
        })
        .from(recoveryAttempts)
        .where(and(eq(recoveryAttempts.id, attemptId), eq(recoveryAttempts.tenantId, tenantId)))
        .limit(1);

      if (!attempt) return reply.status(404).send({ ok: false, error: "attempt_not_found" });
      if (attempt.status !== "failed") {
        return reply.status(409).send({ ok: false, error: "retry_not_allowed", message: "Only failed attempts can be retried." });
      }
      if (hasManualRetryBeenUsed(attempt.meta)) {
        return reply.status(409).send({ ok: false, error: "retry_already_used", message: "Manual retry already consumed for this attempt." });
      }

      const requestedAt = new Date().toISOString();

      await db
        .update(recoveryAttempts)
        .set({
          status: "scheduled",
          reason: "manual_retry_requested",
          executedAt: null,
          meta: mergeMeta(attempt.meta, {
            retry: {
              requestedAt,
              origin: "ui_manual_retry",
              previousStatus: attempt.status,
            },
          }),
        })
        .where(eq(recoveryAttempts.id, attempt.id));

      await enqueueProcessEvent(queue, attempt.eventId, { allowDuplicate: true });

      return reply.status(202).send({
        ok: true,
        accepted: true,
        tenantId,
        attemptId: attempt.id,
        eventId: attempt.eventId,
      });
    },
  );
};

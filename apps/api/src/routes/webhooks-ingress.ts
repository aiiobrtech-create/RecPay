import { createHash } from "node:crypto";
import type { CanonicalEvent } from "@re/core";
import { hashWebhookIngressToken } from "@re/core";
import {
  parseHublaToCanonical,
  parseHotmartToCanonical,
  parseKiwifyToCanonical,
  verifyHublaWebhook,
  verifyHotmartWebhook,
  verifyKiwifyWebhook,
} from "@re/integrations";
import { and, eq, gte } from "drizzle-orm";
import { events, sql, tenants, webhookIngressTokens } from "@re/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { enqueueProcessEvent } from "@re/queue";
import { getDb } from "../db.js";
import { checkGenericWebhookPolicy } from "../lib/webhook-generic-policy.js";
import { getEventsQueue } from "../queue-singleton.js";

const providerSchema = z.enum(["hotmart", "kiwify", "hubla", "generic"]).default("generic");

function bodyLimitBytes(): number {
  const raw = process.env.WEBHOOK_BODY_MAX_BYTES;
  const n = raw ? Number.parseInt(raw, 10) : 262_144;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1_048_576) : 262_144;
}

function stableIdempotencyKey(header: string | undefined, body: unknown): string {
  const trimmed = header?.trim() ?? "";
  if (trimmed.length >= 8) return trimmed.slice(0, 256);
  const serialized = JSON.stringify(body ?? {});
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

function startOfCurrentUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function canonicalEventType(
  outcome: CanonicalEvent["payment"]["outcome"],
): "payment_failed" | "payment_pending" | "payment_approved" | "unknown" {
  if (outcome === "failed") return "payment_failed";
  if (outcome === "pending") return "payment_pending";
  if (outcome === "approved") return "payment_approved";
  return "unknown";
}

function canonicalToRecord(canonical: CanonicalEvent): Record<string, unknown> {
  return {
    pipeline: "v1-provider-adapter",
    provider: canonical.integration,
    eventType: canonical.eventType ?? canonicalEventType(canonical.payment.outcome),
    occurredAt: canonical.occurredAt,
    customer: canonical.customer,
    order: canonical.order,
    payment: canonical.payment,
    rawRef: canonical.rawRef,
  };
}

export const webhooksIngressRoutes: FastifyPluginAsync = async (app) => {
  app.post<{
    Params: { token: string };
    Querystring: { provider?: string };
    Body: unknown;
  }>(
    "/webhooks/ingress/:token",
    {
      bodyLimit: bodyLimitBytes(),
      config: {
        rateLimit: {
          max: 120,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      if (!req.headers["content-type"]?.toLowerCase().includes("application/json")) {
        return reply.status(415).send({ ok: false, error: "unsupported_media_type" });
      }

      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }

      const queue = getEventsQueue();
      if (!queue) {
        return reply.status(503).send({ ok: false, error: "redis_unavailable" });
      }

      const token = req.params.token?.trim() ?? "";
      if (token.length < 16) {
        return reply.status(404).send({ ok: false, error: "not_found" });
      }

      const tokenHash = hashWebhookIngressToken(token);
      const [ingress] = await db
        .select()
        .from(webhookIngressTokens)
        .where(eq(webhookIngressTokens.tokenHash, tokenHash))
        .limit(1);

      if (!ingress) {
        return reply.status(404).send({ ok: false, error: "not_found" });
      }

      const [tenant] = await db
        .select({
          id: tenants.id,
          planMonthlyEventsLimit: tenants.planMonthlyEventsLimit,
        })
        .from(tenants)
        .where(eq(tenants.id, ingress.tenantId))
        .limit(1);

      if (tenant?.planMonthlyEventsLimit && tenant.planMonthlyEventsLimit > 0) {
        const monthStart = startOfCurrentUtcMonth();
        const [countRow] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(events)
          .where(and(eq(events.tenantId, ingress.tenantId), gte(events.createdAt, monthStart)));
        const total = countRow?.total ?? 0;
        if (total >= tenant.planMonthlyEventsLimit) {
          return reply.status(429).send({
            ok: false,
            error: "tenant_monthly_event_limit_exceeded",
            limit: tenant.planMonthlyEventsLimit,
            monthStart: monthStart.toISOString(),
          });
        }
      }

      const providerParsed = providerSchema.safeParse(req.query.provider ?? "generic");
      const provider = providerParsed.success ? providerParsed.data : "generic";

      const genericPolicy = checkGenericWebhookPolicy(provider, req.headers);
      if (!genericPolicy.ok) {
        return reply.status(genericPolicy.status).send({ ok: false, error: genericPolicy.error });
      }

      const idempotencyKey = stableIdempotencyKey(
        req.headers["x-idempotency-key"] as string | undefined,
        req.body,
      );

      const payloadHash = createHash("sha256")
        .update(JSON.stringify(req.body ?? {}), "utf8")
        .digest("hex");

      let canonical: Record<string, unknown> | null = null;

      if (provider === "hotmart") {
        const verified = verifyHotmartWebhook(req.headers, req.body);
        if (!verified.ok) {
          return reply.status(401).send({ ok: false, error: verified.reason });
        }
        const parsedCanonical = parseHotmartToCanonical({
          tenantId: ingress.tenantId,
          idempotencyKey,
          payloadHash,
          payload: req.body,
        });
        if (!parsedCanonical) {
          return reply.status(400).send({ ok: false, error: "invalid_hotmart_payload" });
        }
        canonical = canonicalToRecord(parsedCanonical);
      } else if (provider === "kiwify") {
        const verified = verifyKiwifyWebhook(req.headers, req.body);
        if (!verified.ok) {
          return reply.status(401).send({ ok: false, error: verified.reason });
        }
        const parsedCanonical = parseKiwifyToCanonical({
          tenantId: ingress.tenantId,
          idempotencyKey,
          payloadHash,
          payload: req.body,
        });
        if (!parsedCanonical) {
          return reply.status(400).send({ ok: false, error: "invalid_kiwify_payload" });
        }
        canonical = canonicalToRecord(parsedCanonical);
      } else if (provider === "hubla") {
        const verified = verifyHublaWebhook(req.headers, req.body);
        if (!verified.ok) {
          return reply.status(401).send({ ok: false, error: verified.reason });
        }
        const parsedCanonical = parseHublaToCanonical({
          tenantId: ingress.tenantId,
          idempotencyKey,
          payloadHash,
          payload: req.body,
        });
        if (!parsedCanonical) {
          return reply.status(400).send({ ok: false, error: "invalid_hubla_payload" });
        }
        canonical = canonicalToRecord(parsedCanonical);
      }

      const inserted = await db
        .insert(events)
        .values({
          tenantId: ingress.tenantId,
          idempotencyKey,
          provider,
          status: "received",
          payload: req.body ?? null,
          payloadHash,
          canonical,
        })
        .onConflictDoNothing({
          target: [events.tenantId, events.idempotencyKey],
        })
        .returning({ id: events.id });

      if (inserted.length === 0) {
        const [existing] = await db
          .select({ id: events.id })
          .from(events)
          .where(
            and(eq(events.tenantId, ingress.tenantId), eq(events.idempotencyKey, idempotencyKey)),
          )
          .limit(1);
        return reply.status(200).send({
          ok: true,
          duplicate: true,
          eventId: existing?.id ?? null,
        });
      }

      const eventId = inserted[0]!.id;

      try {
        await enqueueProcessEvent(queue, eventId);
      } catch {
        return reply.status(503).send({ ok: false, error: "queue_unavailable", eventId });
      }

      await db.update(events).set({ status: "queued" }).where(eq(events.id, eventId));

      return reply.status(202).send({
        ok: true,
        accepted: true,
        eventId,
      });
    },
  );
};

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { getAppIdentity } from "@re/app-config";
import { Redis } from "ioredis";
import { checkDatabase } from "../db.js";
import { isProductionLike } from "../lib/production-env.js";
import { getEventsQueue } from "../queue-singleton.js";

function healthReadyTokenValid(req: FastifyRequest): boolean {
  const expected = process.env.HEALTH_READY_TOKEN?.trim();
  if (!expected) return false;
  const bearer = req.headers.authorization?.trim();
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    const t = bearer.slice(7).trim();
    if (t === expected) return true;
  }
  const raw = req.headers["x-health-token"];
  const header = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return Boolean(header && header === expected);
}

async function checkRedis(): Promise<boolean> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return false;
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 5000,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    return pong === "PONG";
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

export const healthRoutes: FastifyPluginAsync = async (app) => {
  const identity = getAppIdentity();

  app.get("/health", async () => ({
    ok: true,
    live: true,
    app: identity,
  }));

  app.get("/health/live", async () => ({
    ok: true,
    live: true,
    app: identity,
  }));

  app.get("/health/ready", async (req: FastifyRequest, reply: FastifyReply) => {
    const [database, redisConn, queueAvailable] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      Promise.resolve(Boolean(getEventsQueue())),
    ]);

    const ok = database && redisConn && queueAvailable;
    const detailedTokenConfigured = Boolean(process.env.HEALTH_READY_TOKEN?.trim());
    if (detailedTokenConfigured && !healthReadyTokenValid(req)) {
      await reply.status(ok ? 200 : 503).send({ ok, ready: ok });
      return;
    }

    // Em produção sem HEALTH_READY_TOKEN, não expor estado de DB/Redis/fila (reconhecimento).
    if (isProductionLike() && !detailedTokenConfigured) {
      await reply.status(ok ? 200 : 503).send({ ok, ready: ok });
      return;
    }

    await reply.status(ok ? 200 : 503).send({
      ok,
      ready: ok,
      database,
      redis: redisConn,
      queue: queueAvailable,
      app: identity,
    });
  });
};

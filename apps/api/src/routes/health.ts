import type { FastifyPluginAsync } from "fastify";
import { getAppIdentity } from "@re/app-config";
import { Redis } from "ioredis";
import { checkDatabase } from "../db.js";
import { getEventsQueue } from "../queue-singleton.js";

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

  app.get("/health/ready", async (_req, reply) => {
    const [database, redisConn, queueAvailable] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      Promise.resolve(Boolean(getEventsQueue())),
    ]);

    const ok = database && redisConn && queueAvailable;
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

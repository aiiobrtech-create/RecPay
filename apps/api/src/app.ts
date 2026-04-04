import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { conversionMessagingRoutes } from "./routes/conversion-messaging.js";
import { dashboardMeRoutes } from "./routes/dashboard-me.js";
import { healthRoutes } from "./routes/health.js";
import { recoveryAttemptsRoutes } from "./routes/recovery-attempts.js";
import {
  stripeBillingWebhookRoutes,
  stripePreParsingHook,
} from "./routes/stripe-billing-webhook.js";
import { tenantLimitsRoutes } from "./routes/tenant-limits.js";
import { tenantMessageTemplatesRoutes } from "./routes/tenant-message-templates.js";
import { webhooksIngressRoutes } from "./routes/webhooks-ingress.js";

function resolveAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5174",
    "http://localhost:5174",
  ];
}

/** Número de proxies na frente da API (X-Forwarded-For). Vazio = compatível com `true` (comportamento anterior). */
function resolveTrustProxy(): boolean | number {
  const raw = process.env.TRUST_PROXY_HOPS?.trim();
  if (raw === undefined || raw === "") return true;
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 0) return n;
  return true;
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.x-admin-token",
          "req.headers.x-health-token",
          "req.headers.x-webhook-generic-secret",
          "req.headers.x-hotmart-hottok",
          "req.headers.x-kiwify-token",
          "req.headers.x-hubla-token",
          "req.headers.stripe-signature",
        ],
        remove: true,
      },
    },
    bodyLimit: 1_048_576,
    trustProxy: resolveTrustProxy(),
  });

  const allowedOrigins = resolveAllowedOrigins();
  await app.register(cors, {
    credentials: false,
    origin: (origin, cb) => {
      // Requests sem Origin (curl, server-to-server) não precisam de CORS.
      if (!origin) return cb(null, true);
      const allowed = allowedOrigins.includes(origin);
      return cb(null, allowed);
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
  });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.ip,
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  app.addHook("preParsing", stripePreParsingHook);

  await app.register(healthRoutes);
  await app.register(stripeBillingWebhookRoutes);
  await app.register(webhooksIngressRoutes);
  await app.register(dashboardMeRoutes);
  await app.register(recoveryAttemptsRoutes);
  await app.register(tenantLimitsRoutes);
  await app.register(tenantMessageTemplatesRoutes);
  await app.register(conversionMessagingRoutes);

  return app;
}

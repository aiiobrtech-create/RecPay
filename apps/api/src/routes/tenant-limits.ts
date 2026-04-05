import { randomBytes } from "node:crypto";
import { hashWebhookIngressToken } from "@re/core";
import { eq } from "drizzle-orm";
import type { TenantIntegrationConfigs, TenantIntegrationProvider } from "@re/db";
import { tenants, webhookIngressTokens } from "@re/db";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { assertTenantManagementAccess, isAdminTokenAuthorized } from "../auth/dashboard-auth.js";
import { getDb } from "../db.js";
import { buildTenantIntegrationConfigs, normalizeTenantIntegrationConfigs } from "../lib/tenant-integrations.js";

const paramsSchema = z.object({
  tenantId: z.string().uuid(),
});

const querySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

const webhookProviderSchema = z.enum(["hotmart", "kiwify", "hubla", "generic"]);
const channelModeSchema = z.enum(["simulated", "evolution"]);
const billingPlanSchema = z.enum(["essential", "growth", "scale"]);
const providerConfigSchema = z.object({
  enabled: z.boolean().optional().default(false),
  apiKey: z.string().trim().max(512).nullable().optional(),
  webhookToken: z.string().trim().max(512).nullable().optional(),
  endpointUrl: z.string().trim().max(2048).nullable().optional(),
});
const integrationConfigsSchema = z
  .object({
    hotmart: providerConfigSchema.nullable().optional(),
    kiwify: providerConfigSchema.nullable().optional(),
    hubla: providerConfigSchema.nullable().optional(),
    generic: providerConfigSchema.nullable().optional(),
  })
  .optional();

const bodySchema = z.object({
  planMonthlyEventsLimit: z.number().int().min(0).max(1_000_000).nullable().optional(),
  planMonthlyRecoveryLimit: z.number().int().min(0).max(1_000_000).nullable().optional(),
  billingPlan: billingPlanSchema.nullable().optional(),
  monthlyFeeCents: z.number().int().min(0).max(100_000_000).optional(),
  successFeeBps: z.number().int().min(0).max(10_000).optional(),
  billingCycleAnchorDay: z.number().int().min(1).max(28).optional(),
  recoveryContactCooldownMinutes: z.number().int().min(1).max(10_080).nullable().optional(),
  recoveryContactMaxAttemptsPerDay: z.number().int().min(1).max(20).nullable().optional(),
  recoveryChannelMode: channelModeSchema.nullable().optional(),
  webhookProviderPreferred: webhookProviderSchema.nullable().optional(),
  providerConfigs: integrationConfigsSchema,
}).superRefine((value, ctx) => {
  const configs = value.providerConfigs;
  if (!configs) return;

  for (const provider of ["hotmart", "kiwify", "hubla", "generic"] as const) {
    const config = configs[provider];
    if (!config?.enabled) continue;

    const hasEndpoint = Boolean(config.endpointUrl?.trim());
    const hasApiKey = Boolean(config.apiKey?.trim());
    const hasWebhookToken = Boolean(config.webhookToken?.trim());
    const valid = provider === "hotmart" ? hasEndpoint : hasEndpoint && hasWebhookToken && hasApiKey;
    if (valid) continue;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["providerConfigs", provider],
      message:
        provider === "hotmart"
          ? "enabled_provider_requires_endpoint_url"
          : "enabled_provider_requires_api_key_webhook_token_and_endpoint_url",
    });
  }
});

const REDACTED_SECRET = "********";

function webhookBaseUrl(): string {
  const explicit = process.env.WEBHOOK_SEED_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const port = process.env.API_PORT?.trim() || "3000";
  return `http://127.0.0.1:${port}`;
}

type SerializableProviderConfig = {
  enabled: boolean;
  apiKey: string | null;
  webhookToken: string | null;
  endpointUrl: string | null;
};

function serializeProviderConfigs(
  configs: TenantIntegrationConfigs | null | undefined,
  options?: { includeSecretValues?: boolean },
): Partial<Record<TenantIntegrationProvider, SerializableProviderConfig>> {
  const normalized = normalizeTenantIntegrationConfigs(configs);
  const out: Partial<Record<TenantIntegrationProvider, SerializableProviderConfig>> = {};
  for (const provider of Object.keys(normalized) as TenantIntegrationProvider[]) {
    const config = normalized[provider];
    if (!config) continue;
    out[provider] = {
      enabled: config.enabled,
      apiKey: options?.includeSecretValues ? config.apiKey : config.apiKey ? REDACTED_SECRET : null,
      webhookToken: options?.includeSecretValues
        ? config.webhookToken
        : config.webhookToken
          ? REDACTED_SECRET
          : null,
      endpointUrl: config.endpointUrl,
    };
  }
  return out;
}

function serializeTenantSettings(row: {
  id: string;
  planMonthlyEventsLimit: number | null;
  planMonthlyRecoveryLimit: number | null;
  billingPlan: string | null;
  monthlyFeeCents: number | null;
  successFeeBps: number | null;
  billingCycleAnchorDay: number | null;
  recoveryContactCooldownMinutes: number | null;
  recoveryContactMaxAttemptsPerDay: number | null;
  recoveryChannelMode: string | null;
  webhookProviderPreferred: string | null;
  integrationConfigs?: TenantIntegrationConfigs | null;
}, options?: { includeProviderConfigs?: boolean; includeSecretValues?: boolean }) {
  const integrationConfigs = options?.includeProviderConfigs
    ? serializeProviderConfigs(row.integrationConfigs, {
        includeSecretValues: options?.includeSecretValues,
      })
    : {};
  return {
    ok: true,
    tenantId: row.id,
    settings: {
      limits: {
        planMonthlyEventsLimit: row.planMonthlyEventsLimit,
        planMonthlyRecoveryLimit: row.planMonthlyRecoveryLimit,
        billingPlan: row.billingPlan,
      },
      billing: {
        monthlyFeeCents: row.monthlyFeeCents,
        successFeeBps: row.successFeeBps,
        billingCycleAnchorDay: row.billingCycleAnchorDay,
      },
      recoveryPolicy: {
        contactCooldownMinutes: row.recoveryContactCooldownMinutes,
        contactMaxAttemptsPerDay: row.recoveryContactMaxAttemptsPerDay,
      },
      integrations: {
        recoveryChannelMode: row.recoveryChannelMode,
        webhookProviderPreferred: row.webhookProviderPreferred,
        providerConfigs: integrationConfigs,
      },
    },
  };
}

/**
 * Limites de plano só podem ser alterados com `x-admin-token` (operação interna).
 */
function stripPlanFieldsForSessionTenant(req: FastifyRequest, updates: Record<string, unknown>): void {
  if (req.tenantAccessViaAdminToken) return;
  delete updates.planMonthlyEventsLimit;
  delete updates.planMonthlyRecoveryLimit;
  delete updates.billingPlan;
}

type TenantPatch = {
  planMonthlyEventsLimit?: number | null;
  planMonthlyRecoveryLimit?: number | null;
  billingPlan?: string | null;
  monthlyFeeCents?: number;
  successFeeBps?: number;
  billingCycleAnchorDay?: number;
  recoveryContactCooldownMinutes?: number | null;
  recoveryContactMaxAttemptsPerDay?: number | null;
  recoveryChannelMode?: "simulated" | "evolution" | null;
  webhookProviderPreferred?: "hotmart" | "kiwify" | "hubla" | "generic" | null;
  integrationConfigs?: TenantIntegrationConfigs | null;
};

function bodyToTenantPatch(parsed: z.infer<typeof bodySchema>): TenantPatch {
  const updates: TenantPatch = {};
  if ("planMonthlyEventsLimit" in parsed) {
    updates.planMonthlyEventsLimit = parsed.planMonthlyEventsLimit ?? null;
  }
  if ("planMonthlyRecoveryLimit" in parsed) {
    updates.planMonthlyRecoveryLimit = parsed.planMonthlyRecoveryLimit ?? null;
  }
  if ("billingPlan" in parsed) {
    updates.billingPlan = parsed.billingPlan ?? null;
  }
  if ("monthlyFeeCents" in parsed) {
    updates.monthlyFeeCents = parsed.monthlyFeeCents;
  }
  if ("successFeeBps" in parsed) {
    updates.successFeeBps = parsed.successFeeBps;
  }
  if ("billingCycleAnchorDay" in parsed) {
    updates.billingCycleAnchorDay = parsed.billingCycleAnchorDay;
  }
  if ("recoveryContactCooldownMinutes" in parsed) {
    updates.recoveryContactCooldownMinutes = parsed.recoveryContactCooldownMinutes ?? null;
  }
  if ("recoveryContactMaxAttemptsPerDay" in parsed) {
    updates.recoveryContactMaxAttemptsPerDay = parsed.recoveryContactMaxAttemptsPerDay ?? null;
  }
  if ("recoveryChannelMode" in parsed) {
    updates.recoveryChannelMode = parsed.recoveryChannelMode ?? null;
  }
  if ("webhookProviderPreferred" in parsed) {
    updates.webhookProviderPreferred = parsed.webhookProviderPreferred ?? null;
  }
  if ("providerConfigs" in parsed) {
    const rawConfigs = parsed.providerConfigs;
    const nextConfigs = rawConfigs
      ? buildTenantIntegrationConfigs(
          rawConfigs as Partial<
            Record<
              TenantIntegrationProvider,
              { enabled?: boolean; apiKey?: string | null; webhookToken?: string | null; endpointUrl?: string | null } | null | undefined
            >
          >,
        )
      : {};
    updates.integrationConfigs = Object.keys(nextConfigs).length > 0 ? nextConfigs : null;
  }
  return updates;
}

function preserveMaskedSecrets(
  nextConfigs: TenantIntegrationConfigs | null | undefined,
  currentConfigs: TenantIntegrationConfigs | null | undefined,
): TenantIntegrationConfigs | null {
  const next = normalizeTenantIntegrationConfigs(nextConfigs);
  const current = normalizeTenantIntegrationConfigs(currentConfigs);
  const merged: TenantIntegrationConfigs = {};

  for (const provider of ["hotmart", "kiwify", "hubla", "generic"] as TenantIntegrationProvider[]) {
    const nextConfig = next[provider];
    const currentConfig = current[provider];
    if (!nextConfig && !currentConfig) continue;
    if (!nextConfig) {
      if (currentConfig) merged[provider] = currentConfig;
      continue;
    }

    merged[provider] = {
      ...nextConfig,
      apiKey:
        nextConfig.apiKey === REDACTED_SECRET
          ? currentConfig?.apiKey ?? null
          : nextConfig.apiKey ?? null,
      webhookToken:
        nextConfig.webhookToken === REDACTED_SECRET
          ? currentConfig?.webhookToken ?? null
          : nextConfig.webhookToken ?? null,
    };
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

export const tenantLimitsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { tenantId: string }; Querystring: Record<string, string | undefined> }>(
    "/admin/tenants/:tenantId/limits",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const parsedParams = paramsSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) {
        return reply.status(400).send({ ok: false, error: "invalid_params" });
      }
      const tenantId = parsedParams.data.tenantId;
      const ok = await assertTenantManagementAccess(req, reply, tenantId, { allowReadonly: true });
      if (!ok) return;

      const db = getDb();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }
      const [row] = await db
        .select({
          id: tenants.id,
          planMonthlyEventsLimit: tenants.planMonthlyEventsLimit,
          planMonthlyRecoveryLimit: tenants.planMonthlyRecoveryLimit,
          billingPlan: tenants.billingPlan,
          monthlyFeeCents: tenants.monthlyFeeCents,
          successFeeBps: tenants.successFeeBps,
          billingCycleAnchorDay: tenants.billingCycleAnchorDay,
          recoveryContactCooldownMinutes: tenants.recoveryContactCooldownMinutes,
          recoveryContactMaxAttemptsPerDay: tenants.recoveryContactMaxAttemptsPerDay,
          recoveryChannelMode: tenants.recoveryChannelMode,
          webhookProviderPreferred: tenants.webhookProviderPreferred,
          integrationConfigs: tenants.integrationConfigs,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!row) return reply.status(404).send({ ok: false, error: "tenant_not_found" });
      return reply.status(200).send(
        serializeTenantSettings(row, {
          includeProviderConfigs: true,
          includeSecretValues: req.tenantAccessViaAdminToken === true,
        }),
      );
    },
  );

  app.patch<{
    Params: { tenantId: string };
    Querystring: Record<string, string | undefined>;
    Body: Record<string, unknown>;
  }>(
    "/admin/tenants/:tenantId/limits",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
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

      const parsedBody = bodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_body",
          issues: parsedBody.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const updates = bodyToTenantPatch(parsedBody.data) as Record<string, unknown>;
      if ("integrationConfigs" in updates) {
        const [currentTenant] = await db
          .select({ integrationConfigs: tenants.integrationConfigs })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        updates.integrationConfigs = preserveMaskedSecrets(
          updates.integrationConfigs as TenantIntegrationConfigs | null | undefined,
          currentTenant?.integrationConfigs ?? null,
        );
      }
      stripPlanFieldsForSessionTenant(req, updates);

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({
          ok: false,
          error: "empty_body_or_plan_requires_admin",
        });
      }

      const [row] = await db
        .update(tenants)
        .set(updates as TenantPatch)
        .where(eq(tenants.id, tenantId))
        .returning({
          id: tenants.id,
          planMonthlyEventsLimit: tenants.planMonthlyEventsLimit,
          planMonthlyRecoveryLimit: tenants.planMonthlyRecoveryLimit,
          billingPlan: tenants.billingPlan,
          monthlyFeeCents: tenants.monthlyFeeCents,
          successFeeBps: tenants.successFeeBps,
          billingCycleAnchorDay: tenants.billingCycleAnchorDay,
          recoveryContactCooldownMinutes: tenants.recoveryContactCooldownMinutes,
          recoveryContactMaxAttemptsPerDay: tenants.recoveryContactMaxAttemptsPerDay,
          recoveryChannelMode: tenants.recoveryChannelMode,
          webhookProviderPreferred: tenants.webhookProviderPreferred,
          integrationConfigs: tenants.integrationConfigs,
        });

      if (!row) return reply.status(404).send({ ok: false, error: "tenant_not_found" });
      return reply.status(200).send(
        serializeTenantSettings(row, {
          includeProviderConfigs: true,
          includeSecretValues: req.tenantAccessViaAdminToken === true,
        }),
      );
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>("/admin/tenants/limits", async (req, reply) => {
    if (!isAdminTokenAuthorized(req)) {
      return reply.status(403).send({ ok: false, error: "admin_token_required" });
    }
    const db = getDb();
    if (!db) {
      return reply.status(503).send({ ok: false, error: "database_unavailable" });
    }
    const parsedQuery = querySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return reply.status(400).send({ ok: false, error: "invalid_query" });
    }

    const q = db
      .select({
        id: tenants.id,
        name: tenants.name,
        planMonthlyEventsLimit: tenants.planMonthlyEventsLimit,
        planMonthlyRecoveryLimit: tenants.planMonthlyRecoveryLimit,
        billingPlan: tenants.billingPlan,
        monthlyFeeCents: tenants.monthlyFeeCents,
        successFeeBps: tenants.successFeeBps,
        billingCycleAnchorDay: tenants.billingCycleAnchorDay,
        recoveryContactCooldownMinutes: tenants.recoveryContactCooldownMinutes,
        recoveryContactMaxAttemptsPerDay: tenants.recoveryContactMaxAttemptsPerDay,
        recoveryChannelMode: tenants.recoveryChannelMode,
        webhookProviderPreferred: tenants.webhookProviderPreferred,
        integrationConfigs: tenants.integrationConfigs,
      })
      .from(tenants);
    const rows = parsedQuery.data.tenantId
      ? await q.where(eq(tenants.id, parsedQuery.data.tenantId)).limit(100)
      : await q.limit(100);

    return reply.status(200).send({
      ok: true,
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        ...serializeTenantSettings(row, {
          includeProviderConfigs: true,
          includeSecretValues: true,
        }).settings,
      })),
    });
  });

  app.get<{ Params: { tenantId: string } }>("/admin/tenants/:tenantId/settings", async (req, reply) => {
    const parsedParams = paramsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) {
      return reply.status(400).send({ ok: false, error: "invalid_params" });
    }
    const tenantId = parsedParams.data.tenantId;
    const ok = await assertTenantManagementAccess(req, reply, tenantId, { allowReadonly: true });
    if (!ok) return;

    const db = getDb();
    if (!db) {
      return reply.status(503).send({ ok: false, error: "database_unavailable" });
    }

    const [row] = await db
      .select({
        id: tenants.id,
        planMonthlyEventsLimit: tenants.planMonthlyEventsLimit,
        planMonthlyRecoveryLimit: tenants.planMonthlyRecoveryLimit,
        billingPlan: tenants.billingPlan,
        monthlyFeeCents: tenants.monthlyFeeCents,
        successFeeBps: tenants.successFeeBps,
        billingCycleAnchorDay: tenants.billingCycleAnchorDay,
        recoveryContactCooldownMinutes: tenants.recoveryContactCooldownMinutes,
        recoveryContactMaxAttemptsPerDay: tenants.recoveryContactMaxAttemptsPerDay,
        recoveryChannelMode: tenants.recoveryChannelMode,
        webhookProviderPreferred: tenants.webhookProviderPreferred,
        integrationConfigs: tenants.integrationConfigs,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!row) return reply.status(404).send({ ok: false, error: "tenant_not_found" });

    const [tokenRow] = await db
      .select({ id: webhookIngressTokens.id, createdAt: webhookIngressTokens.createdAt })
      .from(webhookIngressTokens)
      .where(eq(webhookIngressTokens.tenantId, tenantId))
      .limit(1);

    return reply.status(200).send({
      ...serializeTenantSettings(row, {
        includeProviderConfigs:
          req.tenantAccessViaAdminToken === true || req.tenantMembershipRole !== "readonly",
        includeSecretValues: req.tenantAccessViaAdminToken === true,
      }),
      integrations: {
        hasWebhookToken: Boolean(tokenRow),
        webhookTokenCreatedAt: tokenRow?.createdAt?.toISOString() ?? null,
      },
    });
  });

  app.options("/admin/tenants/:tenantId/settings", async (_req, reply) => reply.status(204).send());

  app.patch<{ Params: { tenantId: string }; Body: Record<string, unknown> }>(
    "/admin/tenants/:tenantId/settings",
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

      const parsedBody = bodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_body",
          issues: parsedBody.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const updates = bodyToTenantPatch(parsedBody.data) as Record<string, unknown>;
      if ("integrationConfigs" in updates) {
        const [currentTenant] = await db
          .select({ integrationConfigs: tenants.integrationConfigs })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        updates.integrationConfigs = preserveMaskedSecrets(
          updates.integrationConfigs as TenantIntegrationConfigs | null | undefined,
          currentTenant?.integrationConfigs ?? null,
        );
      }
      stripPlanFieldsForSessionTenant(req, updates);

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({
          ok: false,
          error: "empty_body_or_plan_requires_admin",
        });
      }

      const [row] = await db
        .update(tenants)
        .set(updates as TenantPatch)
        .where(eq(tenants.id, tenantId))
        .returning({
          id: tenants.id,
          planMonthlyEventsLimit: tenants.planMonthlyEventsLimit,
          planMonthlyRecoveryLimit: tenants.planMonthlyRecoveryLimit,
          billingPlan: tenants.billingPlan,
          monthlyFeeCents: tenants.monthlyFeeCents,
          successFeeBps: tenants.successFeeBps,
          billingCycleAnchorDay: tenants.billingCycleAnchorDay,
          recoveryContactCooldownMinutes: tenants.recoveryContactCooldownMinutes,
          recoveryContactMaxAttemptsPerDay: tenants.recoveryContactMaxAttemptsPerDay,
          recoveryChannelMode: tenants.recoveryChannelMode,
          webhookProviderPreferred: tenants.webhookProviderPreferred,
          integrationConfigs: tenants.integrationConfigs,
        });

      if (!row) return reply.status(404).send({ ok: false, error: "tenant_not_found" });
      return reply.status(200).send(
        serializeTenantSettings(row, {
          includeProviderConfigs: true,
          includeSecretValues: req.tenantAccessViaAdminToken === true,
        }),
      );
    },
  );

  app.post<{ Params: { tenantId: string } }>(
    "/admin/tenants/:tenantId/webhook-token/rotate",
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

      const [tenant] = await db
        .select({ id: tenants.id, webhookProviderPreferred: tenants.webhookProviderPreferred })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) return reply.status(404).send({ ok: false, error: "tenant_not_found" });

      const tokenPlain = randomBytes(24).toString("hex");
      const tokenHash = hashWebhookIngressToken(tokenPlain);
      await db.delete(webhookIngressTokens).where(eq(webhookIngressTokens.tenantId, tenantId));
      await db.insert(webhookIngressTokens).values({ tenantId, tokenHash });

      const provider = tenant.webhookProviderPreferred ?? "generic";
      const webhookUrl = `${webhookBaseUrl()}/webhooks/ingress/${tokenPlain}?provider=${provider}`;
      return reply.status(201).send({
        ok: true,
        tenantId,
        provider,
        webhookUrl,
      });
    },
  );
};

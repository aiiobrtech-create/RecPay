import type {
  TenantIntegrationConfig,
  TenantIntegrationConfigs,
  TenantIntegrationProvider,
} from "@re/db";

const PROVIDERS: TenantIntegrationProvider[] = ["hotmart", "kiwify", "hubla", "generic"];

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeProviderConfig(value: unknown): TenantIntegrationConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const apiKey = cleanString(obj.apiKey);
  const webhookToken = cleanString(obj.webhookToken);
  const endpointUrl = cleanString(obj.endpointUrl);
  const updatedAt = cleanString(obj.updatedAt);
  const enabled = obj.enabled === true || obj.enabled === "true" || obj.enabled === 1;

  if (!enabled && !apiKey && !webhookToken && !endpointUrl && !updatedAt) {
    return null;
  }

  return {
    enabled,
    apiKey,
    webhookToken,
    endpointUrl,
    updatedAt,
  };
}

export function normalizeTenantIntegrationConfigs(value: unknown): TenantIntegrationConfigs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const normalized: TenantIntegrationConfigs = {};
  for (const provider of PROVIDERS) {
    const config = normalizeProviderConfig(raw[provider]);
    if (config) normalized[provider] = config;
  }
  return normalized;
}

export function buildTenantIntegrationConfigs(
  value: Partial<Record<TenantIntegrationProvider, Partial<TenantIntegrationConfig> | null | undefined>>,
): TenantIntegrationConfigs {
  const next: TenantIntegrationConfigs = {};
  for (const provider of PROVIDERS) {
    const raw = value[provider];
    const config = normalizeProviderConfig({
      enabled: raw?.enabled ?? false,
      apiKey: raw?.apiKey ?? null,
      webhookToken: raw?.webhookToken ?? null,
      endpointUrl: raw?.endpointUrl ?? null,
      updatedAt: raw?.updatedAt ?? new Date().toISOString(),
    });
    if (config) next[provider] = config;
  }
  return next;
}

export function providerIntegrationConfig(
  configs: unknown,
  provider: TenantIntegrationProvider,
): TenantIntegrationConfig | null {
  return normalizeTenantIntegrationConfigs(configs)[provider] ?? null;
}

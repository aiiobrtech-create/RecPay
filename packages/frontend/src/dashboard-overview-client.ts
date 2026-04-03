import type { DashboardOverviewResponse } from "@re/core";

export interface FetchDashboardOverviewParams {
  baseUrl: string;
  tenantId: string;
  from?: string;
  to?: string;
  warningThreshold?: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  /** Access token Supabase (JWT) quando a API exige `DASHBOARD_AUTH_REQUIRED=true`. */
  accessToken?: string | null;
}

export class DashboardOverviewHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    super(`dashboard overview request failed (${status} ${statusText})`);
    this.name = "DashboardOverviewHttpError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

function buildOverviewUrl(params: FetchDashboardOverviewParams): string {
  const base = params.baseUrl.endsWith("/") ? params.baseUrl.slice(0, -1) : params.baseUrl;
  const url = new URL(`${base}/dashboard/overview`);
  url.searchParams.set("tenantId", params.tenantId);
  if (params.from) url.searchParams.set("from", params.from);
  if (params.to) url.searchParams.set("to", params.to);
  if (typeof params.warningThreshold === "number") {
    url.searchParams.set("warningThreshold", String(params.warningThreshold));
  }
  return url.toString();
}

export async function fetchDashboardOverview(
  params: FetchDashboardOverviewParams,
): Promise<DashboardOverviewResponse> {
  const fetcher = params.fetcher ?? fetch;
  const headers: Record<string, string> = { accept: "application/json" };
  if (params.accessToken?.trim()) {
    headers.authorization = `Bearer ${params.accessToken.trim()}`;
  }

  const response = await fetcher(buildOverviewUrl(params), {
    method: "GET",
    headers,
    signal: params.signal,
  });

  const text = await response.text();
  let body: unknown = null;
  const trimmed = text.trim();
  if (trimmed) {
    try {
      body = JSON.parse(trimmed) as unknown;
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    throw new DashboardOverviewHttpError(response.status, response.statusText, body);
  }

  return body as DashboardOverviewResponse;
}

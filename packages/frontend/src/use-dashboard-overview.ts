import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardOverviewResponse } from "@re/core";
import { fetchDashboardOverview, type FetchDashboardOverviewParams } from "./dashboard-overview-client.js";

export interface UseDashboardOverviewOptions {
  baseUrl: string;
  tenantId: string;
  from?: string;
  to?: string;
  warningThreshold?: number;
  enabled?: boolean;
  fetcher?: typeof fetch;
  accessToken?: string | null;
}

export interface UseDashboardOverviewResult {
  data: DashboardOverviewResponse | null;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => Promise<void>;
}

function buildFetchParams(options: UseDashboardOverviewOptions): FetchDashboardOverviewParams {
  return {
    baseUrl: options.baseUrl,
    tenantId: options.tenantId,
    from: options.from,
    to: options.to,
    warningThreshold: options.warningThreshold,
    fetcher: options.fetcher,
    accessToken: options.accessToken,
  };
}

export function useDashboardOverview(options: UseDashboardOverviewOptions): UseDashboardOverviewResult {
  const { baseUrl, tenantId, from, to, warningThreshold, enabled = true, fetcher, accessToken } = options;
  const [data, setData] = useState<DashboardOverviewResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const firstLoadRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const runFetch = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsFetching(true);
    if (firstLoadRef.current) setIsLoading(true);
    setError(null);

    try {
      const payload = await fetchDashboardOverview({
        ...buildFetchParams({ baseUrl, tenantId, from, to, warningThreshold, fetcher, accessToken }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setData(payload);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err);
    } finally {
      if (controller.signal.aborted) return;
      setIsFetching(false);
      setIsLoading(false);
      firstLoadRef.current = false;
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [baseUrl, tenantId, from, to, warningThreshold, fetcher, accessToken]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    void runFetch();

    return () => {
      abortRef.current?.abort();
    };
  }, [enabled, runFetch]);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    await runFetch();
  }, [enabled, runFetch]);

  return { data, isLoading, isFetching, error, refetch };
}

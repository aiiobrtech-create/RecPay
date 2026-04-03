export type RecoveryAttemptStatus = "scheduled" | "simulated_sent" | "sent" | "failed";
export type UsageAlertStatus = "normal" | "warning" | "exceeded" | "unlimited";

export interface DashboardOverviewResponse {
  ok: true;
  tenantId: string;
  range: {
    from: string;
    to: string;
    days: number;
  };
  summary: {
    totals: {
      total: number;
      delivered: number;
      failed: number;
      scheduled: number;
      deliveryRate: number;
    };
    byStatus: Record<RecoveryAttemptStatus, number>;
  };
  usage: {
    period: {
      monthStart: string;
    };
    usage: {
      events: {
        used: number;
        limit: number | null;
        unlimited: boolean;
        remaining: number | null;
        utilizationRate: number | null;
      };
      recoveryAttempts: {
        used: number;
        limit: number | null;
        unlimited: boolean;
        remaining: number | null;
        utilizationRate: number | null;
      };
    };
  };
  usageAlerts: {
    warningThreshold: number;
    hasAnyAlert: boolean;
    alerts: {
      events: {
        status: UsageAlertStatus;
        used: number;
        limit: number | null;
        unlimited: boolean;
        remaining: number | null;
        utilizationRate: number | null;
      };
      recoveryAttempts: {
        status: UsageAlertStatus;
        used: number;
        limit: number | null;
        unlimited: boolean;
        remaining: number | null;
        utilizationRate: number | null;
      };
    };
  };
  timeseries: {
    points: Array<{
      day: string;
      events: number;
      recoveryAttempts: number;
    }>;
  };
  kpis: {
    eventsTotal: number;
    failedPaymentEvents: number;
    failureRate: number | null;
    recoveryAttemptsTotal: number;
    recoveryDeliveredTotal: number;
    deliveryRate: number | null;
  };
  trend7d: {
    events: {
      current: number;
      previous: number;
      delta: number;
    };
    recoveryAttempts: {
      current: number;
      previous: number;
      delta: number;
    };
  };
}

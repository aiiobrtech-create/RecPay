import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import {
  formatDashboardActorLabel,
  hasTenantManagementWriteAccess,
  isDashboardAuthEnforced,
  resolveDashboardTenantId,
} from "./dashboard-auth.js";

describe("resolveDashboardTenantId", () => {
  it("uses effective tenant from auth when query omitted", () => {
    const req = {
      dashboardEffectiveTenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    } as FastifyRequest;
    expect(resolveDashboardTenantId(req, undefined)).toEqual({
      ok: true,
      tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
  });

  it("rejects query tenant different from effective (IDOR)", () => {
    const req = {
      dashboardEffectiveTenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    } as FastifyRequest;
    expect(resolveDashboardTenantId(req, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")).toEqual({
      ok: false,
      status: 403,
      error: "tenant_forbidden",
    });
  });

  it("allows matching query when effective is set", () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const req = { dashboardEffectiveTenantId: id } as FastifyRequest;
    expect(resolveDashboardTenantId(req, id)).toEqual({ ok: true, tenantId: id });
  });
});

describe("isDashboardAuthEnforced", () => {
  it("defaults to true when env is unset", () => {
    const prev = process.env.DASHBOARD_AUTH_REQUIRED;
    delete process.env.DASHBOARD_AUTH_REQUIRED;
    try {
      expect(isDashboardAuthEnforced()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.DASHBOARD_AUTH_REQUIRED;
      else process.env.DASHBOARD_AUTH_REQUIRED = prev;
    }
  });

  it("allows explicit legacy opt-out", () => {
    const prev = process.env.DASHBOARD_AUTH_REQUIRED;
    process.env.DASHBOARD_AUTH_REQUIRED = "false";
    try {
      expect(isDashboardAuthEnforced()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.DASHBOARD_AUTH_REQUIRED;
      else process.env.DASHBOARD_AUTH_REQUIRED = prev;
    }
  });
});

describe("hasTenantManagementWriteAccess", () => {
  it("allows owner and admin only", () => {
    expect(hasTenantManagementWriteAccess("owner")).toBe(true);
    expect(hasTenantManagementWriteAccess("admin")).toBe(true);
    expect(hasTenantManagementWriteAccess("member")).toBe(false);
    expect(hasTenantManagementWriteAccess("readonly")).toBe(false);
  });
});

describe("formatDashboardActorLabel", () => {
  it("prefers email when present", () => {
    expect(
      formatDashboardActorLabel({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        email: "ops@recpay.com.br",
      }),
    ).toBe("ops@recpay.com.br");
  });

  it("falls back to user id when email is missing", () => {
    expect(
      formatDashboardActorLabel({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        email: null,
      }),
    ).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});

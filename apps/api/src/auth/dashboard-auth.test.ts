import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { resolveDashboardTenantId } from "./dashboard-auth.js";

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
    expect(
      resolveDashboardTenantId(req, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
    ).toEqual({
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

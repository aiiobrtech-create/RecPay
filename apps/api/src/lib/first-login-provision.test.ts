import { describe, expect, it } from "vitest";
import { deriveTenantNameForFirstLogin } from "./first-login-provision.js";

describe("deriveTenantNameForFirstLogin", () => {
  it("prefers company name from user metadata", () => {
    expect(
      deriveTenantNameForFirstLogin({
        id: "11111111-1111-1111-1111-111111111111",
        email: "owner@example.com",
        user_metadata: { company_name: "Acme LTDA" },
      }),
    ).toBe("Acme LTDA");
  });

  it("falls back to email local part", () => {
    expect(
      deriveTenantNameForFirstLogin({
        id: "11111111-1111-1111-1111-111111111111",
        email: "owner@example.com",
        user_metadata: null,
      }),
    ).toBe("owner");
  });

  it("uses generic label when metadata and email are missing", () => {
    expect(
      deriveTenantNameForFirstLogin({
        id: "11111111-1111-1111-1111-111111111111",
        email: null,
        user_metadata: null,
      }),
    ).toBe("Minha conta");
  });
});

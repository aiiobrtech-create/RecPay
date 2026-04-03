import { afterEach, describe, expect, it, vi } from "vitest";
import { checkGenericWebhookPolicy } from "./webhook-generic-policy.js";

describe("checkGenericWebhookPolicy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores non-generic provider", () => {
    vi.stubEnv("WEBHOOK_GENERIC_SECRET", "");
    expect(checkGenericWebhookPolicy("hotmart", {})).toEqual({ ok: true });
  });

  it("requires matching header when WEBHOOK_GENERIC_SECRET is set", () => {
    vi.stubEnv("WEBHOOK_GENERIC_SECRET", "secret-value");
    expect(
      checkGenericWebhookPolicy("generic", { "x-webhook-generic-secret": "wrong" }),
    ).toMatchObject({ ok: false, status: 401 });
    expect(
      checkGenericWebhookPolicy("generic", { "x-webhook-generic-secret": "secret-value" }),
    ).toEqual({ ok: true });
  });

  it("blocks generic in production without secret unless explicitly allowed", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WEBHOOK_GENERIC_SECRET", "");
    vi.stubEnv("ALLOW_INSECURE_GENERIC_WEBHOOK", "");
    expect(checkGenericWebhookPolicy("generic", {})).toMatchObject({
      ok: false,
      status: 403,
      error: "generic_webhook_secret_required",
    });
  });

  it("allows insecure generic when flag set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WEBHOOK_GENERIC_SECRET", "");
    vi.stubEnv("ALLOW_INSECURE_GENERIC_WEBHOOK", "true");
    expect(checkGenericWebhookPolicy("generic", {})).toEqual({ ok: true });
  });
});

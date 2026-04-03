import { timingSafeEqual } from "node:crypto";
import { isProductionLike } from "./production-env.js";

const GENERIC_SECRET_HEADER = "x-webhook-generic-secret";

function timingSafeStringEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function headerTrimmed(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" ? v.trim() : undefined;
}

/**
 * Provedor `generic`: sem HMAC de plataforma. Em produção exige segredo partilhado ou flag explícita insegura.
 */
export function checkGenericWebhookPolicy(
  provider: string,
  headers: Record<string, string | string[] | undefined>,
):
  | { ok: true }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
    } {
  if (provider !== "generic") return { ok: true };

  const shared = process.env.WEBHOOK_GENERIC_SECRET?.trim();
  if (shared) {
    const provided = headerTrimmed(headers, GENERIC_SECRET_HEADER);
    if (!provided || !timingSafeStringEqual(provided, shared)) {
      return { ok: false, status: 401, error: "generic_webhook_secret_invalid" };
    }
    return { ok: true };
  }

  const allowInsecure =
    process.env.ALLOW_INSECURE_GENERIC_WEBHOOK?.trim().toLowerCase() === "true" ||
    process.env.ALLOW_INSECURE_GENERIC_WEBHOOK?.trim() === "1";

  if (isProductionLike() && !allowInsecure) {
    return {
      ok: false,
      status: 403,
      error: "generic_webhook_secret_required",
    };
  }

  return { ok: true };
}

import { createHash } from "node:crypto";

/** Hash SHA-256 hex do token cru do path (nunca persistir o token em claro). */
export function hashWebhookIngressToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

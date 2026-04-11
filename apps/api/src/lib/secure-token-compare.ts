import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Comparação em tempo constante para segredos de comprimentos diferentes
 * (hash SHA-256 antes de `timingSafeEqual`).
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

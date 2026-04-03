import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/**
 * Sobe diretórios a partir do arquivo chamador até achar `.env` na raiz do monorepo.
 * Use no início de `main.ts` da API/worker: `loadMonorepoEnv(import.meta.url)`.
 */
export function loadMonorepoEnv(fromImportMetaUrl: string): void {
  let dir = dirname(fileURLToPath(fromImportMetaUrl));
  for (let i = 0; i < 10; i += 1) {
    const envPath = resolve(dir, ".env");
    if (existsSync(envPath)) {
      // override: true — valores do .env ganham sobre variáveis já definidas no OS/shell (evita 28P01 com credencial velha).
      config({ path: envPath, override: true });
      return;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
}

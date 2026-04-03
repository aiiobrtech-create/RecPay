/**
 * Monta DATABASE_URL com user/password codificados (evita 28P01 com senhas geradas pelo Supabase).
 *
 * No .env define (além do resto):
 *   SUPABASE_POOLER_HOST=aws-1-us-east-1.pooler.supabase.com
 *   SUPABASE_DB_USER=postgres.ntmdiyjvgebtytuirdrw
 *   SUPABASE_DB_PASSWORD=a_senha_em_texto_puro_que_o_supabase_gerou
 *
 * Corre na raiz: npm run compose:database-url
 *
 * Copia a linha DATABASE_URL=... que aparece e substitui a antiga no .env.
 * Remove ou comenta SUPABASE_DB_PASSWORD depois se quiseres (opcional).
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const host = process.env.SUPABASE_POOLER_HOST?.trim();
const user = process.env.SUPABASE_DB_USER?.trim();
const password = process.env.SUPABASE_DB_PASSWORD;
const database = process.env.SUPABASE_DB_NAME?.trim() || "postgres";
const port = process.env.SUPABASE_DB_PORT?.trim() || "6543";

if (!host || !user || password === undefined || password === "") {
  console.error("Faltam variáveis no .env:");
  console.error("  SUPABASE_POOLER_HOST  (ex.: aws-1-us-east-1.pooler.supabase.com)");
  console.error("  SUPABASE_DB_USER      (ex.: postgres.TEU_REF)");
  console.error("  SUPABASE_DB_PASSWORD  (a senha nova, em texto puro, sem escapar)");
  process.exit(1);
}

const u = encodeURIComponent(user);
const p = encodeURIComponent(password);
const url = `postgresql://${u}:${p}@${host}:${port}/${database}`;

console.info("");
console.info("Cola ISTO no .env (uma linha; apaga ou comenta linhas antigas DATABASE_URL duplicadas):");
console.info("");
console.info(`DATABASE_URL=${url}`);
console.info("");
console.info("Depois: npm run check:db");
console.info("");

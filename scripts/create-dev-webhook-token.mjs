/**
 * CLI: cria um tenant de desenvolvimento + token de ingress webhook (hash no DB).
 * Uso: na raiz do monorepo, com DATABASE_URL no .env — npm run seed:dev-webhook
 */
import { createHash, randomBytes } from "node:crypto";
import { config } from "dotenv";
import postgres from "postgres";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

function hashWebhookIngressToken(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL ausente. Configure o .env na raiz do monorepo.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashWebhookIngressToken(token);

  const devName = `Dev ${new Date().toISOString()}`;

  const [tenant] = await sql`
    INSERT INTO tenants (name)
    VALUES (${devName})
    RETURNING id
  `;

  await sql`
    INSERT INTO webhook_ingress_tokens (tenant_id, token_hash)
    VALUES (${tenant.id}, ${tokenHash})
  `;

  const port = process.env.API_PORT?.trim() || "3000";
  const base =
    process.env.WEBHOOK_SEED_BASE_URL?.trim() || `http://127.0.0.1:${port}`;
  const url = `${base.replace(/\/$/, "")}/webhooks/ingress/${token}`;

  console.info("");
  console.info("--- token de desenvolvimento (não commitar nem partilhar) ---");
  console.info("TENANT_ID=", tenant.id);
  console.info("WEBHOOK_TEST_URL=", url);
  console.info("");
  console.info("Proximos passos:");
  console.info(`1) Cole o TENANT_ID no dashboard (campo 'ID da conta').`);
  console.info(`2) Opcional: configure VITE_TENANT_ID=${tenant.id} no .env para preenchimento automatico.`);
  console.info("3) Para listar todas as contas depois: npm run tenants:list");
  console.info("");
  console.info(
    "Guarde o URL acima; o token não pode ser recuperado do banco (apenas o hash).",
  );
} finally {
  await sql.end({ timeout: 5 });
}

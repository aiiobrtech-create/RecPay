import { config } from "dotenv";
import { resolve } from "node:path";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env"), override: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL ausente. Configure o .env na raiz do monorepo.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const rows = await sql`
    SELECT id, name, created_at
    FROM tenants
    ORDER BY created_at DESC
    LIMIT 100
  `;

  console.info("");
  if (rows.length === 0) {
    console.info("Nenhuma conta encontrada.");
    console.info("Crie a primeira conta com: npm run seed:dev-webhook");
    console.info("");
    process.exit(0);
  }

  console.info("Contas encontradas:");
  rows.forEach((row, index) => {
    const name = row.name ?? "Sem nome";
    console.info(`${index + 1}. ${name} -> ${row.id}`);
  });
  console.info("");
  console.info("Copie um ID e use no dashboard (campo 'ID da conta').");
  console.info("Opcional: defina VITE_TENANT_ID no .env para carregar automaticamente.");
  console.info("");
} finally {
  await sql.end({ timeout: 5 });
}

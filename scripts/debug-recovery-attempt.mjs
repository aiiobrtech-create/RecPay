import { config } from "dotenv";
import { resolve } from "node:path";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env"), override: true });

const attemptId = process.argv[2];
if (!attemptId) {
  console.error("Uso: node scripts/debug-recovery-attempt.mjs <attempt_id>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL ausente no .env");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
try {
  const [row] = await sql`
    select status, reason, meta, created_at, executed_at
    from recovery_attempts
    where id = ${attemptId}::uuid
    limit 1
  `;
  console.log(JSON.stringify(row ?? null, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}


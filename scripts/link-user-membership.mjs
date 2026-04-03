/**
 * Associa um auth.users.id (Supabase) a um tenant existente (tabela memberships).
 * Uso na raiz: LINK_TENANT_ID=uuid LINK_USER_ID=uuid npm run link:membership
 */
import { config } from "dotenv";
import postgres from "postgres";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
const tenantId = process.env.LINK_TENANT_ID?.trim();
const userId = process.env.LINK_USER_ID?.trim();

if (!databaseUrl) {
  console.error("DATABASE_URL ausente.");
  process.exit(1);
}
if (!tenantId || !userId) {
  console.error("Defina LINK_TENANT_ID e LINK_USER_ID (UUID).");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const [t] = await sql`SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1`;
  if (!t) {
    console.error("Tenant não encontrado:", tenantId);
    process.exit(1);
  }
  await sql`
    INSERT INTO memberships (tenant_id, user_id, role)
    VALUES (${tenantId}, ${userId}, 'owner')
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role
  `;
  console.log("MEMBERSHIP_OK tenant=%s user=%s", tenantId, userId);
} catch (e) {
  console.error("MEMBERSHIP_FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await sql.end({ timeout: 2 });
}

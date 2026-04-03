import { config } from "dotenv";
import postgres from "postgres";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL ausente.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const rows = await sql.unsafe(`
    select
      m.tenant_id,
      m.user_id,
      m.role,
      case when u.id is null then false else true end as auth_user_exists
    from memberships m
    left join auth.users u on u.id = m.user_id
    order by m.created_at desc
    limit 200
  `);

  const orphan = rows.filter((row) => !row.auth_user_exists);

  console.info("");
  console.info(`MEMBERSHIPS_TOTAL=${rows.length}`);
  console.info(`MEMBERSHIPS_ORPHAN=${orphan.length}`);
  if (orphan.length > 0) {
    console.info("ORPHAN_LIST=");
    for (const row of orphan) {
      console.info(`- tenant=${row.tenant_id} user=${row.user_id} role=${row.role}`);
    }
  }
  console.info("");
} finally {
  await sql.end({ timeout: 2 });
}

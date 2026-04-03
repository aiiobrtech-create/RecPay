import { config } from "dotenv";
import postgres from "postgres";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
const tenantId = process.env.USAGE_REPORT_TENANT_ID?.trim();
const month = process.env.USAGE_REPORT_MONTH?.trim(); // YYYY-MM

if (!databaseUrl) {
  console.error("DATABASE_URL ausente.");
  process.exit(1);
}
if (!tenantId) {
  console.error("USAGE_REPORT_TENANT_ID ausente.");
  process.exit(1);
}

const now = new Date();
const monthToken = month || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
if (!/^\d{4}-\d{2}$/.test(monthToken)) {
  console.error("USAGE_REPORT_MONTH inválido. Use YYYY-MM.");
  process.exit(1);
}

const from = new Date(`${monthToken}-01T00:00:00.000Z`);
const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 0, 0, 0, 0));

const sql = postgres(databaseUrl, { max: 1 });

try {
  const [eventsRow] = await sql.unsafe(
    `
      select count(*)::int as total
      from events
      where tenant_id = $1 and created_at >= $2 and created_at < $3
    `,
    [tenantId, from.toISOString(), to.toISOString()],
  );
  const [attemptsRow] = await sql.unsafe(
    `
      select
        count(*)::int as total,
        count(*) filter (where status in ('sent','simulated_sent'))::int as delivered,
        count(*) filter (where status = 'failed')::int as failed
      from recovery_attempts
      where tenant_id = $1 and created_at >= $2 and created_at < $3
    `,
    [tenantId, from.toISOString(), to.toISOString()],
  );
  const [amountRow] = await sql.unsafe(
    `
      select coalesce(sum((meta->>'amount')::numeric), 0) as delivered_amount
      from recovery_attempts
      where tenant_id = $1
        and status in ('sent','simulated_sent')
        and created_at >= $2
        and created_at < $3
        and (meta->>'amount') ~ '^[0-9]+(\\.[0-9]+)?$'
    `,
    [tenantId, from.toISOString(), to.toISOString()],
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantId,
        month: monthToken,
        range: { from: from.toISOString(), toExclusive: to.toISOString() },
        eventsTotal: eventsRow?.total ?? 0,
        attemptsTotal: attemptsRow?.total ?? 0,
        attemptsDelivered: attemptsRow?.delivered ?? 0,
        attemptsFailed: attemptsRow?.failed ?? 0,
        deliveredAmount: Number(amountRow?.delivered_amount ?? 0),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 2 });
}

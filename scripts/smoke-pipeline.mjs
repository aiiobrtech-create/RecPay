import assert from "node:assert/strict";
import { config } from "dotenv";
import postgres from "postgres";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
const webhookUrl = process.env.WEBHOOK_TEST_URL?.trim();
const tenantId = process.env.WEBHOOK_SMOKE_TENANT_ID?.trim();
const provider = process.env.WEBHOOK_SMOKE_PROVIDER?.trim() || "generic";

if (!databaseUrl) {
  console.error("SMOKE_PIPELINE_FAIL DATABASE_URL ausente.");
  process.exit(1);
}
if (!webhookUrl || !tenantId) {
  console.error("SMOKE_PIPELINE_SKIP (defina WEBHOOK_TEST_URL e WEBHOOK_SMOKE_TENANT_ID).");
  process.exit(0);
}

const sql = postgres(databaseUrl, { max: 1 });

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

try {
  const idempotencyKey = `smoke-pipeline-${Date.now()}`;
  const payload = {
    source: "smoke-pipeline",
    amount: 12345,
    customer: { email: "smoke@example.com", phone: "5511999999999" },
  };

  const withProvider = webhookUrl.includes("?")
    ? `${webhookUrl}&provider=${encodeURIComponent(provider)}`
    : `${webhookUrl}?provider=${encodeURIComponent(provider)}`;

  const first = await fetch(withProvider, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  const firstBody = await first.json().catch(() => ({}));
  assert.ok(first.status === 202 || first.status === 200, "primeiro POST deve aceitar webhook");
  assert.equal(firstBody?.ok, true, "primeiro webhook deve retornar ok=true");

  const second = await fetch(withProvider, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  const secondBody = await second.json().catch(() => ({}));
  assert.equal(second.status, 200, "segundo POST idempotente deve retornar 200");
  assert.equal(secondBody?.duplicate, true, "segundo webhook deve sinalizar duplicate=true");

  const [eventRow] = await sql.unsafe(
    `
      select id, status
      from events
      where tenant_id = $1 and idempotency_key = $2
      order by created_at desc
      limit 1
    `,
    [tenantId, idempotencyKey],
  );
  assert.ok(eventRow?.id, "evento deve existir para a chave de idempotência");

  const [eventCount] = await sql.unsafe(
    `
      select count(*)::int as total
      from events
      where tenant_id = $1 and idempotency_key = $2
    `,
    [tenantId, idempotencyKey],
  );
  assert.equal(eventCount?.total, 1, "idempotência deve manter 1 único evento");

  let attemptsTotal = 0;
  for (let i = 0; i < 12; i += 1) {
    const [attemptsCount] = await sql.unsafe(
      `
        select count(*)::int as total
        from recovery_attempts
        where tenant_id = $1 and event_id = $2
      `,
      [tenantId, eventRow.id],
    );
    attemptsTotal = attemptsCount?.total ?? 0;
    if (attemptsTotal > 0) break;
    await sleep(2000);
  }

  assert.ok(attemptsTotal > 0, "worker deve criar ao menos 1 tentativa para o evento");
  console.log("SMOKE_PIPELINE_OK");
} catch (error) {
  console.error("SMOKE_PIPELINE_FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await sql.end({ timeout: 2 });
}

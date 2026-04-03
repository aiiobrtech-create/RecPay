import { createHash, randomBytes, randomUUID } from "node:crypto";
import { config } from "dotenv";
import postgres from "postgres";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL ausente. Configure o .env na raiz do monorepo.");
  process.exit(1);
}

function hashWebhookIngressToken(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const tenantName = `Conta Admin Demo ${new Date().toISOString().slice(0, 10)}`;
  const [tenant] = await sql`
    INSERT INTO tenants (
      name,
      plan_monthly_events_limit,
      plan_monthly_recovery_limit,
      recovery_contact_cooldown_minutes,
      recovery_contact_max_attempts_per_day,
      recovery_channel_mode,
      webhook_provider_preferred
    )
    VALUES (
      ${tenantName},
      5000,
      2000,
      180,
      3,
      'evolution',
      'hotmart'
    )
    RETURNING id
  `;

  const adminUserId = randomUUID();
  await sql`
    INSERT INTO memberships (tenant_id, user_id, role)
    VALUES (${tenant.id}, ${adminUserId}, 'admin')
  `;

  const webhookToken = randomBytes(32).toString("hex");
  const webhookHash = hashWebhookIngressToken(webhookToken);
  await sql`
    INSERT INTO webhook_ingress_tokens (tenant_id, token_hash)
    VALUES (${tenant.id}, ${webhookHash})
  `;

  const defaultTemplateBody =
    "Oi {{nome}}, identificamos uma falha no pagamento ({{moeda}} {{valor}}). " +
    "{{#link_checkout}}Use este link: {{link_checkout}}{{/link_checkout}} " +
    "Responder para ajuda.";
  try {
    const [tpl] = await sql`
      INSERT INTO message_templates (tenant_id, name, channel, body, active)
      VALUES (
        ${tenant.id},
        'Recuperação — padrão seed',
        'whatsapp',
        ${defaultTemplateBody},
        true
      )
      RETURNING id
    `;
    await sql`
      INSERT INTO recovery_flows (
        tenant_id,
        name,
        trigger_event_type,
        channel,
        delay_seconds,
        approval_mode,
        enabled,
        priority,
        message_template_id
      )
      VALUES (
        ${tenant.id},
        'Falha de pagamento → WhatsApp',
        'payment_failed',
        'whatsapp',
        0,
        'auto',
        true,
        10,
        ${tpl.id}
      )
    `;
  } catch (err) {
    console.warn(
      "[seed] message_templates/recovery_flows não inseridos (rode db:push + db:rls se as tabelas ainda não existirem):",
      err?.message ?? err,
    );
  }

  const providers = ["hotmart", "kiwify", "hubla", "generic"];
  const eventStatuses = ["processed", "failed", "queued", "received"];
  const attemptStatuses = ["failed", "simulated_sent", "sent", "scheduled"];
  const now = new Date();

  for (let i = 0; i < 24; i += 1) {
    const createdAt = new Date(now.getTime() - i * 6 * 60 * 60 * 1000);
    const provider = providers[i % providers.length];
    const eventStatus = eventStatuses[i % eventStatuses.length];
    const attemptStatus = attemptStatuses[i % attemptStatuses.length];
    const amount = 125 + i * 865;
    const idempotencyKey = `seed-admin-${tenant.id}-${i}`;

    const [event] = await sql`
      INSERT INTO events (
        tenant_id,
        idempotency_key,
        provider,
        status,
        payload,
        payload_hash,
        canonical,
        created_at
      )
      VALUES (
        ${tenant.id},
        ${idempotencyKey},
        ${provider},
        ${eventStatus},
        ${JSON.stringify({ source: "seed-admin-simulation", index: i, provider, amount })}::jsonb,
        ${createHash("sha256").update(`${tenant.id}:${idempotencyKey}`).digest("hex")},
        ${JSON.stringify({
          customer: { id: `cust-${i}`, email: `cliente${i}@demo.local`, phone: "5511999999999" },
          charge: { amount, currency: "BRL" },
          provider,
        })}::jsonb,
        ${createdAt}
      )
      RETURNING id
    `;

    const executedAt = new Date(createdAt.getTime() + 20 * 60 * 1000);
    await sql`
      INSERT INTO recovery_attempts (
        tenant_id,
        event_id,
        channel,
        status,
        reason,
        meta,
        created_at,
        executed_at
      )
      VALUES (
        ${tenant.id},
        ${event.id},
        'whatsapp',
        ${attemptStatus},
        ${attemptStatus === "failed" ? "payment_failed" : null},
        ${JSON.stringify({ source: "seed-admin-simulation", provider, amount, index: i })}::jsonb,
        ${createdAt},
        ${executedAt}
      )
    `;
  }

  const port = process.env.API_PORT?.trim() || "3000";
  const base = process.env.WEBHOOK_SEED_BASE_URL?.trim() || `http://127.0.0.1:${port}`;
  const webhookUrl = `${base.replace(/\/$/, "")}/webhooks/ingress/${webhookToken}`;

  console.info("");
  console.info("Seed admin + simulação criado com sucesso.");
  console.info(`TENANT_ID=${tenant.id}`);
  console.info(`ADMIN_USER_ID=${adminUserId}`);
  console.info(`WEBHOOK_TEST_URL=${webhookUrl}`);
  console.info("");
} finally {
  await sql.end({ timeout: 5 });
}

import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export type TenantIntegrationProvider = "hotmart" | "kiwify" | "hubla" | "generic";

export type TenantIntegrationConfig = {
  enabled: boolean;
  apiKey: string | null;
  webhookToken: string | null;
  endpointUrl: string | null;
  updatedAt: string | null;
};

export type TenantIntegrationConfigs = Partial<
  Record<TenantIntegrationProvider, TenantIntegrationConfig | null>
>;

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "member",
  "readonly",
]);

export const eventStatusEnum = pgEnum("event_status", [
  "received",
  "queued",
  "processed",
  "failed",
]);

export const recoveryAttemptStatusEnum = pgEnum("recovery_attempt_status", [
  "scheduled",
  "simulated_sent",
  "sent",
  "failed",
]);

export const billingEventStatusEnum = pgEnum("billing_event_status", [
  "billable",
  "billed",
  "reversed",
  "ignored",
  "disputed",
]);

export const billingStatementStatusEnum = pgEnum("billing_statement_status", [
  "draft",
  "finalized",
  "paid",
  "payment_failed",
]);

export const chargeAttemptStatusEnum = pgEnum("charge_attempt_status", [
  "pending",
  "paid",
  "failed",
]);

export const flowApprovalModeEnum = pgEnum("flow_approval_mode", ["auto", "requires_approval"]);

export const messageApprovalStatusEnum = pgEnum("message_approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const recoveryLinkApprovalStatusEnum = pgEnum("recovery_link_approval_status", [
  "pending_review",
  "approved",
  "rejected",
]);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Nome da empresa (tenant); não confundir com marca do produto (APP_DISPLAY_NAME). */
    name: text("name").notNull(),
    /** Limite mensal de eventos ingeridos por tenant (null = sem limite). */
    planMonthlyEventsLimit: integer("plan_monthly_events_limit"),
    /** Limite mensal de tentativas de recuperação por tenant (null = sem limite). */
    planMonthlyRecoveryLimit: integer("plan_monthly_recovery_limit"),
    /** Plano comercial (metadata Stripe `re_plan`): essential | growth | scale — opcional; limites numéricos são a fonte de enforcement. */
    billingPlan: text("billing_plan"),
    /** Janela de cooldown por contato (minutos) para evitar spam. */
    recoveryContactCooldownMinutes: integer("recovery_contact_cooldown_minutes"),
    /** Máximo de tentativas por contato em 24h. */
    recoveryContactMaxAttemptsPerDay: integer("recovery_contact_max_attempts_per_day"),
    /** Canal de recuperação escolhido no dashboard (fallback para env quando null). */
    recoveryChannelMode: text("recovery_channel_mode"),
    /** Provedor webhook preferencial selecionado pelo cliente no dashboard. */
    webhookProviderPreferred: text("webhook_provider_preferred"),
    integrationConfigs: jsonb("integration_configs").$type<TenantIntegrationConfigs | null>(),
    /** Preenchido ao provisionar conta via Stripe Checkout (webhook); idempotência por sessão. */
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeDefaultPaymentMethodId: text("stripe_default_payment_method_id"),
    monthlyFeeCents: integer("monthly_fee_cents").notNull().default(0),
    successFeeBps: integer("success_fee_bps").notNull().default(500),
    billingCycleAnchorDay: integer("billing_cycle_anchor_day").notNull().default(1),
  },
  (t) => [unique("tenants_stripe_checkout_session_id_unique").on(t.stripeCheckoutSessionId)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** UUID do usuário em `auth.users` (Supabase Auth). */
    userId: uuid("user_id").notNull(),
    role: membershipRoleEnum("role").notNull().default("member"),
  },
  (t) => [unique("memberships_tenant_user_unique").on(t.tenantId, t.userId)],
);

/**
 * Capacidade operacional global no painel (ex.: aprovar links de recuperação).
 * É separada das memberships por tenant para evitar acoplamento indevido entre operação interna e clientes.
 */
export const dashboardOperatorAccess = pgTable("dashboard_operator_access", {
  userId: uuid("user_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  grantedBy: text("granted_by"),
  note: text("note"),
});

/** Token opaco do endpoint de webhook por tenant; armazenamos só hash (SHA-256 hex). */
export const webhookIngressTokens = pgTable("webhook_ingress_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    provider: text("provider").notNull(),
    status: eventStatusEnum("status").notNull().default("received"),
    payload: jsonb("payload").$type<unknown | null>(),
    payloadHash: text("payload_hash"),
    canonical: jsonb("canonical").$type<Record<string, unknown> | null>(),
  },
  (t) => [unique("events_tenant_idempotency_unique").on(t.tenantId, t.idempotencyKey)],
);

export const recoveryAttempts = pgTable(
  "recovery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("whatsapp"),
    status: recoveryAttemptStatusEnum("status").notNull().default("scheduled"),
    reason: text("reason"),
    meta: jsonb("meta").$type<Record<string, unknown> | null>(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (t) => [unique("recovery_attempts_event_unique").on(t.eventId)],
);

/** Mensagens base por tenant (placeholders {{nome}}, {{valor}}, …). */
export const messageTemplates = pgTable("message_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  channel: text("channel").notNull().default("whatsapp"),
  body: text("body").notNull(),
  active: boolean("active").notNull().default(true),
});

/** Variações A/B ponderadas por template. */
export const messageVariants = pgTable("message_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  templateId: uuid("template_id")
    .notNull()
    .references(() => messageTemplates.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  weight: integer("weight").notNull().default(1),
  /** Se null, reutiliza o corpo do template. */
  body: text("body"),
  active: boolean("active").notNull().default(true),
});

/** Fluxo por evento de gatilho + modo de aprovação (governança híbrida). */
export const recoveryFlows = pgTable("recovery_flows", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  triggerEventType: text("trigger_event_type").notNull(),
  channel: text("channel").notNull().default("whatsapp"),
  delaySeconds: integer("delay_seconds").notNull().default(0),
  approvalMode: flowApprovalModeEnum("approval_mode").notNull().default("auto"),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  messageTemplateId: uuid("message_template_id")
    .notNull()
    .references(() => messageTemplates.id, { onDelete: "restrict" }),
});

/** Fila de revisão humana antes do envio (quando `requires_approval`). */
export const messageApprovals = pgTable(
  "message_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    recoveryAttemptId: uuid("recovery_attempt_id")
      .notNull()
      .references(() => recoveryAttempts.id, { onDelete: "cascade" }),
    status: messageApprovalStatusEnum("status").notNull().default("pending"),
    composedBody: text("composed_body").notNull(),
    reviewerNote: text("reviewer_note"),
    resolvedBy: text("resolved_by"),
  },
  (t) => [unique("message_approvals_attempt_unique").on(t.recoveryAttemptId)],
);

/** Atribuição último toque entre tentativa de recuperação e evento de pagamento aprovado. */
export const conversionAttributions = pgTable(
  "conversion_attributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    recoveryAttemptId: uuid("recovery_attempt_id")
      .notNull()
      .references(() => recoveryAttempts.id, { onDelete: "cascade" }),
    conversionEventId: uuid("conversion_event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    attributionWindowHours: integer("attribution_window_hours").notNull().default(72),
  },
  (t) => [
    unique("conversion_attributions_attempt_unique").on(t.recoveryAttemptId),
    unique("conversion_attributions_conversion_event_unique").on(t.conversionEventId),
  ],
);

export const recoveryLinks = pgTable("recovery_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  platform: text("platform"),
  triggerEventType: text("trigger_event_type"),
  productName: text("product_name"),
  active: boolean("active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  approvalStatus: recoveryLinkApprovalStatusEnum("approval_status")
    .notNull()
    .default("pending_review"),
  approvalNote: text("approval_note"),
  submittedBy: text("submitted_by"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const billingStatements = pgTable(
  "billing_statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    recoveredTotalCents: integer("recovered_total_cents").notNull().default(0),
    commissionTotalCents: integer("commission_total_cents").notNull().default(0),
    monthlyFeeCents: integer("monthly_fee_cents").notNull().default(0),
    grandTotalCents: integer("grand_total_cents").notNull().default(0),
    status: billingStatementStatusEnum("status").notNull().default("draft"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    chargedAt: timestamp("charged_at", { withTimezone: true }),
  },
  (t) => [unique("billing_statements_period_unique").on(t.tenantId, t.periodStart, t.periodEnd)],
);

export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceEventId: uuid("source_event_id").references(() => events.id, { onDelete: "set null" }),
    externalReference: text("external_reference").notNull(),
    debtorReference: text("debtor_reference"),
    recoveredAmountCents: integer("recovered_amount_cents").notNull(),
    currency: text("currency").notNull().default("BRL"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    commissionRateBps: integer("commission_rate_bps").notNull(),
    commissionAmountCents: integer("commission_amount_cents").notNull(),
    status: billingEventStatusEnum("status").notNull().default("billable"),
    billingStatementId: uuid("billing_statement_id").references(() => billingStatements.id, {
      onDelete: "set null",
    }),
    reversalOfBillingEventId: uuid("reversal_of_billing_event_id"),
  },
  (t) => [
    unique("billing_events_source_event_unique").on(t.sourceEventId),
    unique("billing_events_tenant_external_reference_unique").on(t.tenantId, t.externalReference),
  ],
);

export const chargeAttempts = pgTable("charge_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  billingStatementId: uuid("billing_statement_id")
    .notNull()
    .references(() => billingStatements.id, { onDelete: "cascade" }),
  paymentGateway: text("payment_gateway").notNull(),
  externalChargeId: text("external_charge_id"),
  amountCents: integer("amount_cents").notNull(),
  status: chargeAttemptStatusEnum("status").notNull().default("pending"),
  failureReason: text("failure_reason"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
});

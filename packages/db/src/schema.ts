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

export const flowApprovalModeEnum = pgEnum("flow_approval_mode", ["auto", "requires_approval"]);

export const messageApprovalStatusEnum = pgEnum("message_approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Nome da empresa (tenant); não confundir com marca do produto (APP_DISPLAY_NAME). */
  name: text("name").notNull(),
  /** Limite mensal de eventos ingeridos por tenant (null = sem limite). */
  planMonthlyEventsLimit: integer("plan_monthly_events_limit"),
  /** Limite mensal de tentativas de recuperação por tenant (null = sem limite). */
  planMonthlyRecoveryLimit: integer("plan_monthly_recovery_limit"),
  /** Janela de cooldown por contato (minutos) para evitar spam. */
  recoveryContactCooldownMinutes: integer("recovery_contact_cooldown_minutes"),
  /** Máximo de tentativas por contato em 24h. */
  recoveryContactMaxAttemptsPerDay: integer("recovery_contact_max_attempts_per_day"),
  /** Canal de recuperação escolhido no dashboard (fallback para env quando null). */
  recoveryChannelMode: text("recovery_channel_mode"),
  /** Provedor webhook preferencial selecionado pelo cliente no dashboard. */
  webhookProviderPreferred: text("webhook_provider_preferred"),
});

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

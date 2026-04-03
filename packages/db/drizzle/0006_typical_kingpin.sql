CREATE TYPE "public"."flow_approval_mode" AS ENUM('auto', 'requires_approval');--> statement-breakpoint
CREATE TYPE "public"."message_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "conversion_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recovery_attempt_id" uuid NOT NULL,
	"conversion_event_id" uuid NOT NULL,
	"attribution_window_hours" integer DEFAULT 72 NOT NULL,
	CONSTRAINT "conversion_attributions_attempt_unique" UNIQUE("recovery_attempt_id"),
	CONSTRAINT "conversion_attributions_conversion_event_unique" UNIQUE("conversion_event_id")
);
--> statement-breakpoint
CREATE TABLE "message_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"tenant_id" uuid NOT NULL,
	"recovery_attempt_id" uuid NOT NULL,
	"status" "message_approval_status" DEFAULT 'pending' NOT NULL,
	"composed_body" text NOT NULL,
	"reviewer_note" text,
	"resolved_by" text,
	CONSTRAINT "message_approvals_attempt_unique" UNIQUE("recovery_attempt_id")
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"label" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"body" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger_event_type" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"delay_seconds" integer DEFAULT 0 NOT NULL,
	"approval_mode" "flow_approval_mode" DEFAULT 'auto' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"message_template_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversion_attributions" ADD CONSTRAINT "conversion_attributions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_attributions" ADD CONSTRAINT "conversion_attributions_recovery_attempt_id_recovery_attempts_id_fk" FOREIGN KEY ("recovery_attempt_id") REFERENCES "public"."recovery_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_attributions" ADD CONSTRAINT "conversion_attributions_conversion_event_id_events_id_fk" FOREIGN KEY ("conversion_event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_approvals" ADD CONSTRAINT "message_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_approvals" ADD CONSTRAINT "message_approvals_recovery_attempt_id_recovery_attempts_id_fk" FOREIGN KEY ("recovery_attempt_id") REFERENCES "public"."recovery_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_variants" ADD CONSTRAINT "message_variants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_variants" ADD CONSTRAINT "message_variants_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_flows" ADD CONSTRAINT "recovery_flows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_flows" ADD CONSTRAINT "recovery_flows_message_template_id_message_templates_id_fk" FOREIGN KEY ("message_template_id") REFERENCES "public"."message_templates"("id") ON DELETE restrict ON UPDATE no action;
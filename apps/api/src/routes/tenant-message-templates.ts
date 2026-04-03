import { and, desc, eq } from "drizzle-orm";
import { messageTemplates, messageVariants, recoveryFlows } from "@re/db";
import {
  CONVERSION_TRIGGER_EVENT_LABELS,
  RECOVERY_SALES_TRIGGER_EVENTS,
  type ConversionTriggerEventType,
  defaultRecoveryTemplatePt,
} from "@re/core";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { assertTenantManagementAccess } from "../auth/dashboard-auth.js";
import { getDb } from "../db.js";

const paramsTenant = z.object({
  tenantId: z.string().uuid(),
});

const paramsTemplate = z.object({
  tenantId: z.string().uuid(),
  templateId: z.string().uuid(),
});

const paramsTemplateVariant = z.object({
  tenantId: z.string().uuid(),
  templateId: z.string().uuid(),
  variantId: z.string().uuid(),
});

const patchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(8000).optional(),
  active: z.boolean().optional(),
});

const bootstrapBody = z.object({
  name: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(8000).optional(),
});

const WHATSAPP_TRIGGER_CREATE = z.enum(
  RECOVERY_SALES_TRIGGER_EVENTS as unknown as [string, ...string[]],
);

const createWhatsappFlowBody = z.object({
  triggerEventType: WHATSAPP_TRIGGER_CREATE,
  flowName: z.string().min(1).max(200).optional(),
  templateName: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(8000).optional(),
});

const variantPatchBody = z.object({
  label: z.string().min(1).max(200).optional(),
  weight: z.coerce.number().int().min(0).max(10_000).optional(),
  body: z.union([z.string().max(8000), z.literal("")]).nullable().optional(),
  active: z.boolean().optional(),
});

export const tenantMessageTemplatesRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { tenantId: string } }>(
    "/admin/tenants/:tenantId/message-templates",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const parsed = paramsTenant.safeParse(req.params ?? {});
      if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid_params" });
      const tenantId = parsed.data.tenantId;
      const ok = await assertTenantManagementAccess(req, reply, tenantId, { allowReadonly: true });
      if (!ok) return;

      const db = getDb();
      if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });

      const rows = await db
        .select({
          id: messageTemplates.id,
          createdAt: messageTemplates.createdAt,
          updatedAt: messageTemplates.updatedAt,
          tenantId: messageTemplates.tenantId,
          name: messageTemplates.name,
          channel: messageTemplates.channel,
          body: messageTemplates.body,
          active: messageTemplates.active,
        })
        .from(messageTemplates)
        .where(eq(messageTemplates.tenantId, tenantId))
        .orderBy(desc(messageTemplates.updatedAt));

      const flowRows = await db
        .select({
          id: recoveryFlows.id,
          name: recoveryFlows.name,
          triggerEventType: recoveryFlows.triggerEventType,
          messageTemplateId: recoveryFlows.messageTemplateId,
          enabled: recoveryFlows.enabled,
          priority: recoveryFlows.priority,
          channel: recoveryFlows.channel,
        })
        .from(recoveryFlows)
        .where(and(eq(recoveryFlows.tenantId, tenantId), eq(recoveryFlows.channel, "whatsapp")))
        .orderBy(desc(recoveryFlows.priority), desc(recoveryFlows.updatedAt));

      const variantRows = await db
        .select({
          id: messageVariants.id,
          templateId: messageVariants.templateId,
          label: messageVariants.label,
          weight: messageVariants.weight,
          body: messageVariants.body,
          active: messageVariants.active,
        })
        .from(messageVariants)
        .where(eq(messageVariants.tenantId, tenantId))
        .orderBy(desc(messageVariants.createdAt));

      const whatsappFlows = flowRows.map((f) => ({
        id: f.id,
        name: f.name,
        triggerEventType: f.triggerEventType,
        triggerLabel:
          f.triggerEventType in CONVERSION_TRIGGER_EVENT_LABELS
            ? CONVERSION_TRIGGER_EVENT_LABELS[f.triggerEventType as ConversionTriggerEventType]
            : f.triggerEventType,
        messageTemplateId: f.messageTemplateId,
        enabled: f.enabled,
        priority: f.priority,
      }));

      const triggerCatalog = RECOVERY_SALES_TRIGGER_EVENTS.map((value) => ({
        value,
        label: CONVERSION_TRIGGER_EVENT_LABELS[value],
      }));

      return reply.status(200).send({
        ok: true,
        items: rows,
        whatsappFlows,
        messageVariants: variantRows,
        triggerCatalog,
        systemDefaultBody: defaultRecoveryTemplatePt(),
      });
    },
  );

  app.patch<{ Params: { tenantId: string; templateId: string }; Body: unknown }>(
    "/admin/tenants/:tenantId/message-templates/:templateId",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const parsedParams = paramsTemplate.safeParse(req.params ?? {});
      if (!parsedParams.success) return reply.status(400).send({ ok: false, error: "invalid_params" });
      const { tenantId, templateId } = parsedParams.data;

      const accessOk = await assertTenantManagementAccess(req, reply, tenantId);
      if (!accessOk) return;

      const parsedBody = patchBody.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_body",
          issues: parsedBody.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const patch: {
        name?: string;
        body?: string;
        active?: boolean;
        updatedAt: Date;
      } = { updatedAt: new Date() };
      if (parsedBody.data.name !== undefined) patch.name = parsedBody.data.name;
      if (parsedBody.data.body !== undefined) patch.body = parsedBody.data.body;
      if (parsedBody.data.active !== undefined) patch.active = parsedBody.data.active;
      if (
        parsedBody.data.name === undefined &&
        parsedBody.data.body === undefined &&
        parsedBody.data.active === undefined
      ) {
        return reply.status(400).send({ ok: false, error: "empty_body" });
      }

      const db = getDb();
      if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });

      const [row] = await db
        .update(messageTemplates)
        .set(patch)
        .where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.tenantId, tenantId)))
        .returning();

      if (!row) return reply.status(404).send({ ok: false, error: "template_not_found" });
      return reply.status(200).send({ ok: true, template: row });
    },
  );

  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    "/admin/tenants/:tenantId/message-templates/bootstrap",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const parsedParams = paramsTenant.safeParse(req.params ?? {});
      if (!parsedParams.success) return reply.status(400).send({ ok: false, error: "invalid_params" });
      const tenantId = parsedParams.data.tenantId;

      const accessOk = await assertTenantManagementAccess(req, reply, tenantId);
      if (!accessOk) return;

      const parsedBody = bootstrapBody.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_body",
          issues: parsedBody.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const db = getDb();
      if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });

      const [existingTpl] = await db
        .select({ id: messageTemplates.id })
        .from(messageTemplates)
        .where(eq(messageTemplates.tenantId, tenantId))
        .limit(1);

      if (existingTpl) {
        return reply.status(409).send({ ok: false, error: "templates_already_exist", templateId: existingTpl.id });
      }

      const [existingFlow] = await db
        .select({ id: recoveryFlows.id })
        .from(recoveryFlows)
        .where(eq(recoveryFlows.tenantId, tenantId))
        .limit(1);

      if (existingFlow) {
        return reply.status(409).send({
          ok: false,
          error: "flows_exist_without_template_state",
          detail: "Estado inconsistente: existe fluxo sem modelo visível. Contacte a operação.",
        });
      }

      const bodyText = parsedBody.data.body?.trim() || defaultRecoveryTemplatePt();
      const name = parsedBody.data.name?.trim() || "Mensagem de recuperação";

      const [tpl] = await db
        .insert(messageTemplates)
        .values({
          tenantId,
          name,
          channel: "whatsapp",
          body: bodyText,
          active: true,
        })
        .returning();

      if (!tpl) return reply.status(500).send({ ok: false, error: "insert_failed" });

      await db.insert(recoveryFlows).values({
        tenantId,
        name: "Falha de pagamento — WhatsApp",
        triggerEventType: "payment_failed",
        channel: "whatsapp",
        delaySeconds: 0,
        approvalMode: "auto",
        enabled: true,
        priority: 10,
        messageTemplateId: tpl.id,
      });

      return reply.status(201).send({ ok: true, template: tpl, bootstrappedFlow: true });
    },
  );

  app.post<{ Params: { tenantId: string }; Body: unknown }>(
    "/admin/tenants/:tenantId/whatsapp-recovery-flows",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const parsedParams = paramsTenant.safeParse(req.params ?? {});
      if (!parsedParams.success) return reply.status(400).send({ ok: false, error: "invalid_params" });
      const tenantId = parsedParams.data.tenantId;

      const accessOk = await assertTenantManagementAccess(req, reply, tenantId);
      if (!accessOk) return;

      const parsedBody = createWhatsappFlowBody.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_body",
          issues: parsedBody.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      const trigger = parsedBody.data.triggerEventType;

      const db = getDb();
      if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });

      const [existingFlow] = await db
        .select({ id: recoveryFlows.id })
        .from(recoveryFlows)
        .where(
          and(
            eq(recoveryFlows.tenantId, tenantId),
            eq(recoveryFlows.triggerEventType, trigger),
            eq(recoveryFlows.channel, "whatsapp"),
            eq(recoveryFlows.enabled, true),
          ),
        )
        .limit(1);

      if (existingFlow) {
        return reply.status(409).send({
          ok: false,
          error: "whatsapp_flow_already_exists",
          flowId: existingFlow.id,
        });
      }

      const defaultLabel = CONVERSION_TRIGGER_EVENT_LABELS[trigger as ConversionTriggerEventType];
      const bodyText = parsedBody.data.body?.trim() || defaultRecoveryTemplatePt();
      const templateName = parsedBody.data.templateName?.trim() || `${defaultLabel} — WhatsApp`;
      const flowName = parsedBody.data.flowName?.trim() || `${defaultLabel} — WhatsApp`;

      const [tpl] = await db
        .insert(messageTemplates)
        .values({
          tenantId,
          name: templateName,
          channel: "whatsapp",
          body: bodyText,
          active: true,
        })
        .returning();

      if (!tpl) return reply.status(500).send({ ok: false, error: "insert_failed" });

      const [flow] = await db
        .insert(recoveryFlows)
        .values({
          tenantId,
          name: flowName,
          triggerEventType: trigger,
          channel: "whatsapp",
          delaySeconds: 0,
          approvalMode: "auto",
          enabled: true,
          priority: 10,
          messageTemplateId: tpl.id,
        })
        .returning();

      if (!flow) return reply.status(500).send({ ok: false, error: "flow_insert_failed" });

      return reply.status(201).send({ ok: true, template: tpl, flow });
    },
  );

  app.patch<{ Params: { tenantId: string; templateId: string; variantId: string }; Body: unknown }>(
    "/admin/tenants/:tenantId/message-templates/:templateId/variants/:variantId",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const parsedParams = paramsTemplateVariant.safeParse(req.params ?? {});
      if (!parsedParams.success) return reply.status(400).send({ ok: false, error: "invalid_params" });
      const { tenantId, templateId, variantId } = parsedParams.data;

      const accessOk = await assertTenantManagementAccess(req, reply, tenantId);
      if (!accessOk) return;

      const parsedBody = variantPatchBody.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_body",
          issues: parsedBody.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      if (
        parsedBody.data.label === undefined &&
        parsedBody.data.weight === undefined &&
        parsedBody.data.body === undefined &&
        parsedBody.data.active === undefined
      ) {
        return reply.status(400).send({ ok: false, error: "empty_body" });
      }

      const db = getDb();
      if (!db) return reply.status(503).send({ ok: false, error: "database_unavailable" });

      const patch: {
        label?: string;
        weight?: number;
        body?: string | null;
        active?: boolean;
      } = {};
      if (parsedBody.data.label !== undefined) patch.label = parsedBody.data.label;
      if (parsedBody.data.weight !== undefined) patch.weight = parsedBody.data.weight;
      if (parsedBody.data.body !== undefined) {
        const b = parsedBody.data.body;
        patch.body = b === null || b === "" ? null : b;
      }
      if (parsedBody.data.active !== undefined) patch.active = parsedBody.data.active;

      const [row] = await db
        .update(messageVariants)
        .set(patch)
        .where(
          and(
            eq(messageVariants.id, variantId),
            eq(messageVariants.templateId, templateId),
            eq(messageVariants.tenantId, tenantId),
          ),
        )
        .returning();

      if (!row) return reply.status(404).send({ ok: false, error: "variant_not_found" });
      return reply.status(200).send({ ok: true, variant: row });
    },
  );
};

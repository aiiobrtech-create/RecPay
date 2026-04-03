import type { ConversionTriggerEventType } from "./conversion-events.js";

/** Contexto mínimo para compor mensagem (sem PII desnecessária no contrato). */
export type MessageCompositionContext = {
  trigger: ConversionTriggerEventType;
  customerName: string;
  amountFormatted: string;
  currency: string;
  checkoutLink?: string | null;
  orderRef?: string | null;
};

export type ContentGeneratorResult = {
  body: string;
  shortPreview?: string;
  /** 0–1 quando houver modelo probabilístico (IA); templates fixos usam 1. */
  confidence: number;
  /** Flags para governança futura (IA). */
  complianceFlags: string[];
};

/**
 * Contrato plugável para geração de texto: MVP = templates;
 * depois implementar `AiContentGenerator` com a mesma interface.
 */
export interface ContentGenerator {
  readonly id: string;
  compose(templateBody: string, ctx: MessageCompositionContext): ContentGeneratorResult;
}

const PLACEHOLDERS: Record<string, keyof MessageCompositionContext> = {
  "{{nome}}": "customerName",
  "{{valor}}": "amountFormatted",
  "{{moeda}}": "currency",
  "{{link_checkout}}": "checkoutLink",
  "{{pedido}}": "orderRef",
};

/**
 * Substitui placeholders `{{chave}}` conhecidos; segmentos opcionais `{{#link_checkout}}...{{/link_checkout}}`
 * são removidos se o valor estiver vazio.
 */
export class TemplateContentGenerator implements ContentGenerator {
  readonly id = "template_v1";

  compose(templateBody: string, ctx: MessageCompositionContext): ContentGeneratorResult {
    let out = templateBody;

    const link = ctx.checkoutLink?.trim() || "";
    if (!link) {
      out = out.replace(/\{\{#link_checkout\}\}[\s\S]*?\{\{\/link_checkout\}\}/g, "");
    } else {
      out = out.replace(/\{\{#link_checkout\}\}/g, "").replace(/\{\{\/link_checkout\}\}/g, "");
    }

    for (const [token, field] of Object.entries(PLACEHOLDERS)) {
      const raw = ctx[field];
      const value =
        raw === null || raw === undefined ? "" : typeof raw === "string" ? raw : String(raw);
      out = out.split(token).join(value || "");
    }

    const missing = out.match(/\{\{[^}]+\}\}/g);
    const flags = missing?.length ? [`unresolved_placeholders:${missing.join(",")}`] : [];

    return {
      body: out.trim(),
      shortPreview: out.trim().slice(0, 140),
      confidence: 1,
      complianceFlags: flags,
    };
  }
}

export function defaultRecoveryTemplatePt(): string {
  return (
    "Oi {{nome}}, identificamos uma falha no pagamento ({{moeda}} {{valor}}). " +
    "{{#link_checkout}}Use este link para concluir: {{link_checkout}}{{/link_checkout}} " +
    "Responda esta mensagem se precisar de ajuda."
  );
}

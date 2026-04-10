/**
 * Espelha a substituição de {@link TemplateContentGenerator} em @re/core
 * sem importar o pacote inteiro no bundle do browser (evita node:crypto).
 */

/** Variáveis inseríveis no editor (mesmo contrato do worker / @re/core). */
export const RECOVERY_PLACEHOLDER_CLIPBOARD_ITEMS = [
  { id: "nome", title: "Nome do cliente", copy: "{{nome}}", chipLabel: "{{nome}}" },
  { id: "valor", title: "Valor (formatado)", copy: "{{valor}}", chipLabel: "{{valor}}" },
  { id: "moeda", title: "Moeda", copy: "{{moeda}}", chipLabel: "{{moeda}}" },
  { id: "pedido", title: "Referência do pedido", copy: "{{pedido}}", chipLabel: "{{pedido}}" },
  { id: "link_checkout", title: "URL de pagamento", copy: "{{link_checkout}}", chipLabel: "{{link_checkout}}" },
  {
    id: "block_link",
    title: "Bloco opcional com link",
    copy:
      "{{#link_checkout}}Quando for conveniente, você pode finalizar com segurança por este link: {{link_checkout}}{{/link_checkout}}",
    chipLabel: "{{#link_checkout}}…{{/link_checkout}}",
  },
] as const;

const DEMO_CTX = {
  "{{nome}}": "Maria Silva",
  "{{valor}}": "97,00",
  "{{moeda}}": "R$",
  "{{link_checkout}}": "https://pay.exemplo.com/finalizar",
  "{{pedido}}": "PED-8821",
} as const;

export function composeRecoveryMessagePreview(templateBody: string): string {
  let out = templateBody.trim();
  if (!out) return "";

  const link = DEMO_CTX["{{link_checkout}}"];
  if (!link) {
    out = out.replace(/\{\{#link_checkout\}\}[\s\S]*?\{\{\/link_checkout\}\}/g, "");
  } else {
    out = out.replace(/\{\{#link_checkout\}\}/g, "").replace(/\{\{\/link_checkout\}\}/g, "");
  }

  for (const [token, value] of Object.entries(DEMO_CTX)) {
    out = out.split(token).join(value);
  }

  return out.trim();
}

# Sistema de mensagens de conversão (MVP)

## Gatilhos (evento canônico → WhatsApp)

| `trigger_event_type` | Origem típica | Ação no MVP |
|---------------------|---------------|-------------|
| `payment_failed` | Webhook de checkout / pagamento recusado | Fluxo de recuperação (template + opcional aprovação) |
| `payment_approved` | Webhook de pagamento aprovado | Atribuição a tentativa `sent`/`simulated_sent` (janela padrão 72h) |
| `payment_pending` | Reservado | Sem envio automático no MVP |
| `abandoned_checkout` | Futuro | Sem pipeline até haver evento normalizado |
| `unknown` | Payload incompleto | Ignorado para envio |

Configuração por tenant: tabela `recovery_flows` (`trigger_event_type`, `enabled`, `priority`, `approval_mode`, `message_template_id`).

## Governança híbrida

- `approval_mode = auto`: após regras de telefone / cooldown / limite, envio simulado ou Evolution.
- `approval_mode = requires_approval`: cria linha em `message_approvals` com status `pending`; o worker interrompe até `approve` ou `reject` via API (`POST /conversion/message-approvals/:id/approve|reject`).

## Motor assíncrono

Webhook → persistência de evento → fila Redis (`process` job) → worker → `process-event.ts` → regras → envio ou fila de aprovação.

## Integração futura com IA

Contrato `ContentGenerator` em `@re/core` (`TemplateContentGenerator` hoje). Nova implementação pode substituir o corpo do template mantendo placeholders e `meta.messaging.contentGeneratorId`.

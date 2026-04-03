# Cronograma de desenvolvimento — Recovery Engine Brasil

Cronograma por **etapas sequenciais** com **regras explícitas** de entrada, saída e proibições. Durações são **estimativas** (semanas de trabalho focado); paralelizar só onde indicado. Tudo deve obedecer a **`PROJETO.md`**.

---

## Regras que valem em todas as etapas

| Regra | Detalhe |
|--------|---------|
| **R0 — PROJETO.md** | Nenhuma etapa “fechada” se o código violar segurança ou escalabilidade definidas ali, salvo exceção documentada com prazo. |
| **R1 — Multi-tenant** | Toda tabela/entidade de negócio com `tenant_id`; testes ou revisão manual anti vazamento entre tenants antes de avançar quando a etapa tocar dados. |
| **R2 — Segredos** | Nada de credenciais no Git; `.env.example` sem valores reais; service role / API keys só API/worker. |
| **R3 — Webhook** | Assinatura validada antes de efeito colateral; idempotência onde houver retentativa; body limitado. |
| **R4 — Assíncrono** | Processamento pesado não bloqueia resposta HTTP do webhook além do acordado na etapa (fila). |
| **R5 — Definição de pronto** | CI com build + lint + testes mínimos da etapa; sem merge na trunk principal com build quebrado. |

---

## Etapa 0 — Fundação do repositório e ambientes

**Duração sugerida:** 1–2 semanas.

**Objetivo:** Repositório, monorepo, CI básico, ambientes nomeados, contratos de código.

### Entregas

- Monorepo (`apps/api`, `apps/worker`, `packages/*`) compilando.
- CI: install, lint (quando existir), build, testes (mesmo que smoke).
- Documentação de como rodar API e worker localmente.
- `.env.example` atualizado; nenhum segredo versionado.

### Regras de conclusão (todas obrigatórias)

- [ ] Dois serviços distintos (API e worker) podem ser iniciados em dev.
- [ ] `npm run build` na raiz passa no CI.
- [ ] Branches protegidas exigem CI verde (se o repositório usar Git).

### Proibido nesta etapa

- Implementar lógica de negócio “completa” sem a Etapa 1 (dados) definida.
- Desativar `strict` do TypeScript ou ignorar falhas de build “temporariamente” sem issue e prazo.

---

## Etapa 1 — Banco de dados, multi-tenant e políticas

**Duração sugerida:** 2–3 semanas.  
**Depende de:** Etapa 0.

**Objetivo:** Schema inicial, migrações, RLS (ou plano equivalente se Postgres fora Supabase), modelo `tenant` / `user` / `membership`.

### Entregas

- Migrações versionadas (`packages/db` ou Supabase migrations): `tenants`, usuários/memberships, tabelas base para `events` (estrutura mínima).
- **RLS** (ou documento técnico impeditivo se a stack ainda não tiver Postgres — neste projeto o alvo é Postgres + RLS): políticas por `tenant_id` para tabelas multi-tenant.
- Repositórios ou camada de acesso que **sempre** filtram por tenant no código server-side.
- Teste automatizado **cross-tenant** (mínimo 1 cenário: usuário/tenant A não lê dados de B).

### Regras de conclusão

- [ ] Nenhuma tabela de negócio sem `tenant_id` (exceto tabelas globais justificadas e listadas no PR).
- [ ] RLS habilitada nas tabelas sensíveis em ambiente de staging (ou local com Postgres igual produção).
- [ ] Política de backup / uso do pooler documentada (uma página ou seção em `PROJETO.md` ou README de infra).

### Proibido nesta etapa

- “Abrir” RLS com `USING (true)` em produção.
- Dashboard público sem autenticação apontando ao banco com chave anon sem políticas restritivas.

---

## Etapa 2 — Autenticação, API interna e fila

**Duração sugerida:** 2–4 semanas.  
**Depende de:** Etapa 1.

**Objetivo:** Login/sessão (ou JWT) com tenant ativo; API REST mínima; fila + Redis (ou equivalente); worker consome jobs.

### Entregas

- Fluxo de autenticação alinhado ao provedor escolhido (ex.: Supabase Auth + `memberships`).
- Rotas internas protegidas: validação de schema (ex.: Zod) nas entradas.
- Fila operacional: enfileirar job de teste; worker processa com retry/backoff básico e **idempotência** no handler de exemplo.
- Rate limit na API (mesmo que simples) em rota sensível.

### Regras de conclusão

- [ ] Nenhuma rota autenticada retorna dados sem validar tenant.
- [ ] Worker não usa credenciais de browser; só server-side.
- [ ] Falha do worker não corrompe estado (transações ou compensação documentada).

### Proibido nesta etapa

- Processar webhook real sem Etapa 3 (receiver dedicado com validação).
- Armazenar senha em texto plano.

---

## Etapa 3 — Webhook receiver + persistência de eventos

**Duração sugerida:** 2–3 semanas.  
**Depende de:** Etapas 1 e 2.

**Objetivo:** Endpoint de webhook por integração (primeiro: **uma** plataforma), validação de assinatura, persistência de evento bruto + idempotência, enfileiramento para o worker.

### Entregas

- Rota( s) em `apps/api/src/webhooks/` com limite de body, timeout e rejeição de tipo inválido.
- Adapter em `packages/integrations` para **uma** plataforma: verify + parse → `CanonicalEvent` (`packages/core`).
- Tabela `events` (ou equivalente) com status (`received`, `queued`, `processed`, `failed`) e chave de idempotência única por tenant.

### Regras de conclusão

- [ ] Assinatura do provedor verificada antes de gravar como “válido para processamento”.
- [ ] Mesmo webhook reenviado não gera segunda linha de efeito de negócio duplicado (teste de idempotência).
- [ ] Logs sem payload completo de PII em nível padrão.

### Proibido nesta etapa

- Confiar em campo do JSON sem validação de schema.
- Enviar WhatsApp em produção sem Etapa 4 revisada.

---

## Etapa 4 — Motor de decisão mínimo + ação (WhatsApp ou stub)

**Duração sugerida:** 3–5 semanas.  
**Depende de:** Etapa 3.

**Objetivo:** Worker aplica regra simples (ex.: `payment.outcome === failed` → iniciar recuperação); primeira ação real ou **stub** contratual com fila idempotente.

### Entregas

- Módulo `decisions/` com regras versionáveis ou configuráveis por tenant (mesmo que JSON estático no MVP).
- Módulo `actions/`: integração WhatsApp **ou** adapter com fila e log de “enviaria mensagem” atrás de feature flag em staging.
- Tabelas `recovery_attempts` / `recoveries` conforme `PROJETO.md` (mínimo viável).
- Opt-out / supressão mínima se canal for WhatsApp (estrutura de dados + checagem antes de enviar).

### Regras de conclusão

- [ ] Dupla execução do mesmo job não dispara duas cobranças nem duas mensagens (idempotência comprovada por teste ou documentação + teste).
- [ ] Critério objetivo para gravar `recovery` (ex.: confirmação de pagamento aprovado) documentado no código ou em `PROJETO.md`.

### Proibido nesta etapa

- Spam: sem limite de tentativas por lead/tenant.
- Template ou mensagem fora das políticas do provedor de WhatsApp em produção.

---

## Etapa 5 — Dashboard MVP

**Duração sugerida:** 3–5 semanas.  
**Pode iniciar em paralelo** após Etapa 2 para UI estática, mas **integração real** depende das etapas 3–4.

**Objetivo:** Visão por tenant: eventos recentes, tentativas, recuperações do período; apenas dados permitidos por RLS + backend.

### Entregas

- App web (pode ser `apps/web` futuro) ou BFF nas rotas da API com front separado — decisão registrada no repositório.
- Listagens paginadas; sem export sem autenticação.
- Onboarding mínimo: criar tenant, convidar usuário, configurar integração (campos secretos mascarados).

### Regras de conclusão

- [ ] Nenhuma query de dashboard sem `tenant_id` no backend.
- [ ] Teste ou checklist manual de isolamento entre tenants na UI.

### Proibido nesta etapa

- Expor `service_role` ou string de conexão no bundle do cliente.

---

## Etapa 6 — Segunda integração + regras avançadas

**Duração sugerida:** 3–4 semanas.  
**Depende de:** Etapa 3 (padrão do adapter claro).

**Objetivo:** Segunda plataforma (Hotmart/Kiwify/Hubla); follow-up agendado; limites por plano (campos no tenant).

### Entregas

- Segundo adapter em `packages/integrations` com mesma garantia de assinatura + idempotência.
- Scheduler idempotente para follow-ups.
- Campos de plano/limites aplicados no worker antes de ações custosas.

### Regras de conclusão

- [ ] Cobertura de teste ou fixtures para payloads da segunda integração.
- [ ] Métricas por integração (taxa de erro, latência) visíveis em log estruturado ou painel mínimo.

### Proibido nesta etapa

- Copiar/colar adapter sem extrair padrão comum (duplicação descontrolada de verify/parse).

---

## Etapa 7 — Cobrança, uso mensal e endurecimento

**Duração sugerida:** 3–5 semanas.  
**Depende de:** Etapas 4–5.

**Objetivo:** Acumular valor recuperado por tenant/mês; fechamento; gateway de pagamento; auditoria e logs de billing.

### Entregas

- Tabelas `usage_monthly` / `invoices` (ou equivalente); relatório exportável autenticado.
- Integração com provedor de pagamento (cartão) conforme modelo de negócio do documento de produto.
- Revisão de segurança: CORS, rate limit, headers, revisão de RLS.

### Regras de conclusão

- [ ] Reprocessamento de job não gera linha de fatura duplicada para o mesmo evento de recuperação.
- [ ] Checklist de deploy produção (HTTPS, secrets, backups) assinado ou registrado em issue.

### Proibido nesta etapa

- Cobrar percentual sem definição auditável de “recuperado” (IDs / referência de transação).

---

## Etapa 8 — Piloto em produção e observabilidade

**Duração sugerida:** 2–3 semanas (contínua depois).  
**Depende de:** Etapas 4–7 conforme escopo do piloto.

**Objetivo:** 1–3 tenants reais; alertas; runbooks; metas de SLO internas.

### Entregas

- Alertas: fila crescendo, erro sustentado em worker, falha de verificação de webhook.
- Runbook: incidente de dados, revogação de chave, bloqueio WhatsApp.
- Revisão LGPD: retenção aplicada ou roadmap com data.

### Regras de conclusão

- [ ] Plano de backup testado uma vez (restore em ambiente não produtivo).
- [ ] Canal de suporte e escalação definido para o piloto.

---

## Mapa de dependências (resumo)

```text
0 → 1 → 2 → 3 → 4 → 7
         ↘ 5 (parcial desde 2; completo com 3–4)
3 → 6
4–7 → 8
```

---

## Governança do cronograma

- Atrasos: **não** remover regras de segurança para “ganhar tempo”; cortar escopo da etapa (menos integrações, menos features UI) mantendo `PROJETO.md`.
- Mudança de ordem: atualizar este arquivo num PR com justificativa.
- Ao concluir cada etapa, marcar checkboxes na revisão do PR ou em issue de épico.

---

*Referência obrigatória: `PROJETO.md`. Documento de produto: `saa_s_recovery_engine_brasil_documento_completo.md`.*

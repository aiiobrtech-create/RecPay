# O que precisa para começar o desenvolvimento

Checklist alinhado a `PROJETO.md` e `CRONOGRAMA.md` (Etapas 0–1).

## 1. Ambiente local

- **Node.js 20+** (`node -v`)
- **npm** (workspaces na raiz do repositório)
- Conta **Supabase** (grátis serve) ou outro **PostgreSQL 15+**
- **Docker** (opcional) — para Redis via `docker compose` na raiz

## 2. Configuração

1. Copie `.env.example` para `.env` na raiz (ou por app, conforme for evoluindo).
2. Defina **`SUPABASE_URL`** com a *Project URL* (ex.: `https://<ref>.supabase.co` em *Settings → API*).
3. Opcional para o **dashboard no browser**: **`SUPABASE_ANON_KEY`** — chave **anon public** no mesmo ecrã de API. Nunca coloque **`service_role`** no `.env` que o front possa ler nem no repositório.
4. Preencha **`DATABASE_URL`** com a connection string do Postgres (no Supabase: *Project Settings → Database*). **Recomendado:** modo **Transaction** (pooler, porta **6543**) — costuma funcionar melhor no Windows e evita `getaddrinfo ENOENT` comum com o host **direct** `db.<ref>.supabase.co`.
5. Defina **`REDIS_URL`** — ex.: `redis://127.0.0.1:6379` após subir o Redis (ver secção 3.1).
6. Opcional — marca provisória sem alterar código:
   - `APP_ID`, `APP_DISPLAY_NAME`, `APP_SLUG`  
   Ou edite só `packages/app-config/src/defaults.ts` (ver `packages/app-config/COMO_RENOMEAR.md`).
7. `API_PORT` (padrão `3000`), `API_HOST` (padrão `0.0.0.0`).
8. **`ADMIN_API_TOKEN`** (opcional mas recomendado) — token para rotas administrativas (`/conversion/*`, limites por tenant, etc.).
9. Após alterações de schema: `npm run db:push -w @re/db` e `npm run db:rls` (aplica também RLS de mensagens de conversão).

**Mensagens de conversão (WhatsApp):** ver [`docs/CONVERSION_MESSAGING.md`](docs/CONVERSION_MESSAGING.md). API REST sob `/conversion/*` com header `x-admin-token` (mesmo valor de `ADMIN_API_TOKEN`).

**Segurança:** não commite `.env`; não compartilhe *service_role* nem senha do banco em chat ou repositório público.

### 2.3 Deploy em produção (VPS)

- **`NODE_ENV=production`** ou **`API_ENV=production`**: a API **falha ao iniciar** se `DASHBOARD_AUTH_REQUIRED` não estiver ativo (`true`/`1`), para não expor o modo legado (`?tenantId=` sem Bearer). No front, use **`VITE_DASHBOARD_AUTH_REQUIRED=true`** no build.
- Webhook com **`?provider=generic`**: em produção configure **`WEBHOOK_GENERIC_SECRET`** e envie o header **`x-webhook-generic-secret`**, ou defina **`ALLOW_INSECURE_GENERIC_WEBHOOK=true`** apenas se aceitar o risco (token só no path).
- **`HEALTH_READY_TOKEN`** (opcional): se definido, `GET /health/ready` só devolve `database` / `redis` / `queue` com **`Authorization: Bearer <token>`** ou **`X-Health-Token`**; caso contrário responde só `{ ok, ready }`.
- **Reverse proxy** (Nginx/Caddy): enviar `X-Forwarded-For` / `X-Real-IP` de forma correta; opcionalmente **`TRUST_PROXY_HOPS=1`** (um salto) para o rate limit por IP refletir o cliente real.
- **`npm audit`:** avisos moderados de **esbuild** via **`drizzle-kit`** (ferramenta CLI em desenvolvimento) podem persistir até o upstream atualizar dependências; não afetam o runtime da API em produção. Evite `npm audit fix --force` sem rever o impacto em migrações.

### 2.2 Primeiro acesso ao dashboard (conta/tenant do zero)

Se esta a configurar do zero e ainda nao sabe qual ID usar no painel:

1. Crie uma conta de desenvolvimento (se ainda nao existe):

```bash
npm run seed:dev-webhook
```

Esse comando agora imprime `TENANT_ID=` no terminal.

2. Para listar todas as contas existentes e seus IDs:

```bash
npm run tenants:list
```

3. Cole o ID no dashboard (campo **ID da conta**) e clique em **Aplicar filtros**.

4. Opcional: para nao preencher manualmente toda vez, defina no `.env`:

```bash
VITE_TENANT_ID=SEU_TENANT_ID
```

### 2.1 Supabase MCP (no Cursor)

Se quiseres que o **assistente no Cursor** consulte e altere o **mesmo projeto** no Supabase **sem depender do DNS local** em comandos `node`:

1. Confirma que o MCP **Supabase** está ativo: **Cursor Settings → MCP** (ou *Tools & MCP*), com login/autorização ao projeto certo. Documentação oficial: [Model context protocol (MCP) — Supabase](https://supabase.com/docs/guides/getting-started/mcp).
2. No chat podes pedir coisas do tipo: “lista tabelas”, “executa este SELECT”, “aplica esta migração” — o assistente usa o servidor MCP (`user-supabase`: `list_tables`, `execute_sql`, `apply_migration`, etc.).
3. **Importante:** a **API e o worker** (`npm run dev`) continuam a usar **Postgres** via **`DATABASE_URL`** no `.env` (Drizzle). O MCP **não substitui** essa variável no runtime da app; substitui é ajuda no IDE quando a tua rede não resolve `db.*.supabase.co` para scripts locais. Mantém o schema em `packages/db` e os `.sql` em `packages/db/sql` como **fonte da verdade** no Git e alinha o que aplicares por MCP.

## 3. Banco de dados e RLS

### 3.1 Redis (fila)

Na raiz do monorepo:

```bash
npm run docker:up
```

Isso sobe Redis em `localhost:6379`. Ajuste **`REDIS_URL`** no `.env` se usar outro host/porta.

### 3.2 Schema (Drizzle)

```bash
# Aplicar schema ao banco (desenvolvimento — sincroniza com Drizzle, inclui tabelas novas)
npm run db:push -w @re/db
```

Ou, para fluxo só com migrações versionadas:

```bash
cd packages/db && npx drizzle-kit migrate --config drizzle.config.cjs
```

(Exige `DATABASE_URL` e journal em `packages/db/drizzle/`.)

O Drizzle usa `packages/db/drizzle.config.cjs`, que carrega o `.env` da **raiz** do monorepo automaticamente.

### 3.3 Políticas RLS (SQL versionado — **CLI**)

Após `db:push`, aplique todos os `.sql` em [`packages/db/sql/`](packages/db/sql/) pela ordem do nome do ficheiro:

```bash
npm run db:rls
```

Usa `DATABASE_URL` do `.env` na raiz (mesmo padrão que `check:db`). Os scripts são **idempotentes** onde faz sentido (`DROP POLICY IF EXISTS` em `001`).

Alternativa manual: `psql "$DATABASE_URL" -f packages/db/sql/001_rls_policies.sql` (e `002`), ou SQL Editor só se a CLI não for possível.

O acesso com **anon/authenticated** no Supabase fica restrito por RLS; a API/worker continuam a validar `tenant_id` no código.

## 4. Token de webhook de desenvolvimento (CLI)

Gera um tenant + linha em `webhook_ingress_tokens` e imprime uma URL de teste **uma vez** (o token em claro não fica no banco):

```bash
npm run seed:dev-webhook
```

Guarde o `WEBHOOK_TEST_URL=` impresso. Opcional: `WEBHOOK_SEED_BASE_URL` no `.env` se a API não for em `127.0.0.1:PORT`.

## 5. Rodar API e worker (um comando)

Na raiz, com Docker disponível se `REDIS_URL` for localhost:

```bash
npm run dev
```

Isto: sobe Redis (`docker compose up -d`) se o host do Redis for local, espera a porta, opcionalmente sincroniza o DB (ver abaixo), e arranca **API + worker + web** juntos.

- Por omissão **`npm run dev`** já corre **`db:push`** + **`db:rls`** antes da API (se falhar por rede/DNS, aparece aviso e API/worker sobem na mesma). Para desligar: `AUTO_DB_SYNC=0` no `.env`.
- `npm run setup:db` — só DB (`db:push` + `db:rls`) sem subir serviços.

Para arrancar **só** API ou worker (debug):

```bash
npm run dev:api
npm run dev:worker
```

Para arrancar o dashboard web (Vite + React):

```bash
npm run dev:web
```

Abre em `http://127.0.0.1:5173`.

No `.env`, configure:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000
VITE_TENANT_ID=SEU_TENANT_ID
```

Se o browser mostrar erro de rede/CORS ao buscar dashboard, configure também:

```bash
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

- `GET /health` — processo vivo + objeto `app`.
- `GET /health/ready` — `database`, **`redis`** e **`queue`** devem ser `true` (503 se faltar `DATABASE_URL` / `REDIS_URL` ou fila). Se **`HEALTH_READY_TOKEN`** estiver definido, o detalhe só aparece com token (ver secção 2.3).

### Teste rápido do ingress (substitua pela URL do seed)

```bash
curl -sS -X POST "SUA_URL_DO_SEED?provider=generic" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: teste-manual-1" \
  -d "{\"hello\":true}"
```

Respostas esperadas: `202` com `eventId` na primeira vez; `200` com `duplicate: true` ao repetir o mesmo body/`X-Idempotency-Key`.

### Teste Hotmart (assinatura/token validado)

Com provider `hotmart`, o ingress exige verificação configurada:

- `HOTMART_HOTTOK` **ou**
- `HOTMART_WEBHOOK_SECRET`

Exemplo (token Hottok):

```bash
curl -sS -X POST "SUA_URL_DO_SEED?provider=hotmart" \
  -H "Content-Type: application/json" \
  -H "X-Hotmart-Hottok: $HOTMART_HOTTOK" \
  -H "X-Idempotency-Key: hotmart-manual-1" \
  -d "{\"event\":\"PURCHASE_CANCELED\",\"data\":{\"purchase\":{\"status\":\"CANCELED\",\"transaction\":\"TX-1\",\"price\":129.9},\"buyer\":{\"email\":\"cliente@example.com\",\"phone\":\"5511999999999\",\"name\":\"Cliente\"}}}"
```

### Teste Kiwify (assinatura/token validado)

Com provider `kiwify`, configure `KIWIFY_WEBHOOK_TOKEN` **ou** `KIWIFY_WEBHOOK_SECRET`.

```bash
curl -sS -X POST "SUA_URL_DO_SEED?provider=kiwify" \
  -H "Content-Type: application/json" \
  -H "X-Kiwify-Token: $KIWIFY_WEBHOOK_TOKEN" \
  -H "X-Idempotency-Key: kiwify-manual-1" \
  -d "{\"event\":\"order.refused\",\"order_id\":\"KWF-1\",\"payment_status\":\"failed\",\"amount\":99.9,\"currency\":\"BRL\",\"customer\":{\"id\":\"c-1\",\"email\":\"cliente@example.com\",\"phone\":\"5511999999999\",\"name\":\"Cliente\"}}"
```

### Teste Hubla (assinatura/token validado)

Com provider `hubla`, configure `HUBLA_WEBHOOK_TOKEN` **ou** `HUBLA_WEBHOOK_SECRET`.

```bash
curl -sS -X POST "SUA_URL_DO_SEED?provider=hubla" \
  -H "Content-Type: application/json" \
  -H "X-Hubla-Token: $HUBLA_WEBHOOK_TOKEN" \
  -H "X-Idempotency-Key: hubla-manual-1" \
  -d "{\"event\":\"payment.failed\",\"id\":\"HBL-1\",\"payment_status\":\"failed\",\"amount\":89.9,\"currency\":\"BRL\",\"customer\":{\"id\":\"c-1\",\"email\":\"cliente@example.com\",\"phone\":\"5511999999999\",\"name\":\"Cliente\"}}"
```

### Dashboard API (MVP)

- Listagem paginada:

```bash
curl -sS "http://127.0.0.1:3000/recovery-attempts?tenantId=SEU_TENANT_ID&limit=20"
```

- Resumo por status/período:

```bash
curl -sS "http://127.0.0.1:3000/recovery-attempts/summary?tenantId=SEU_TENANT_ID"
```

- Uso mensal vs limite por plano:

```bash
curl -sS "http://127.0.0.1:3000/recovery-attempts/usage?tenantId=SEU_TENANT_ID"
```

- Alertas de limite (warning/exceeded):

```bash
curl -sS "http://127.0.0.1:3000/recovery-attempts/usage-alerts?tenantId=SEU_TENANT_ID&warningThreshold=0.8"
```

- Série temporal diária (events + recovery attempts):

```bash
curl -sS "http://127.0.0.1:3000/recovery-attempts/usage-timeseries?tenantId=SEU_TENANT_ID"
```

Range opcional:

```bash
curl -sS "http://127.0.0.1:3000/recovery-attempts/usage-timeseries?tenantId=SEU_TENANT_ID&from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z"
```

- KPIs executivos + tendência 7 dias:

```bash
curl -sS "http://127.0.0.1:3000/recovery-attempts/kpis?tenantId=SEU_TENANT_ID"
```

- Overview único (1 request para dashboard):

```bash
curl -sS "http://127.0.0.1:3000/dashboard/overview?tenantId=SEU_TENANT_ID&warningThreshold=0.8"
```

O contrato TypeScript deste payload está em `@re/core`:

- `DashboardOverviewResponse` (`packages/core/src/domain/dashboard-overview.ts`)

SDK frontend (cliente + hook React):

- pacote: `@re/frontend`
- `fetchDashboardOverview(...)` para chamadas HTTP
- `useDashboardOverview(...)` com `data`, `isLoading`, `isFetching`, `error`, `refetch`

- Detalhe por evento:

```bash
curl -sS "http://127.0.0.1:3000/recovery-attempts/event/SEU_EVENT_ID?tenantId=SEU_TENANT_ID"
```

- Retry manual de tentativa:

```bash
curl -sS -X POST "http://127.0.0.1:3000/recovery-attempts/SEU_ATTEMPT_ID/retry?tenantId=SEU_TENANT_ID" \
  -H "Content-Type: application/json" \
  -d "{}"
```

## 6. Verificar conexão com o Postgres

```bash
npm run audit:env
npm run check:dns
npm run check:db
```

- `audit:env` — conta linhas `DATABASE_URL` no `.env` (deve ser **uma** só).

- `check:dns` — só testa se o **hostname** da `DATABASE_URL` resolve (útil antes de `db:push`).
- `check:db` — deve imprimir `DB_OK` se DNS + Postgres aceitarem a conexão.

### Erro `getaddrinfo ENOENT` (Windows / Node)

O host **`db.SEU_REF.supabase.co`** (connection string **Direct**) por vezes **não resolve** no teu DNS/rede. A solução mais comum é **não usar esse host**: usa a URI do **Transaction pooler** que o próprio Supabase gera.

**Passo a passo no dashboard**

1. [Supabase Dashboard](https://supabase.com/dashboard) → abre o projeto.
2. **Project Settings** (roda dentada) → **Database**.
3. Em **Connection string** / **Connect to your project**: tipo **URI**.
4. **Método / Pooler:** escolhe **Transaction** (porta **6543**). Não uses **Direct** (porta 5432) se o `check:dns` falhar no `db.*.supabase.co`.
5. Copia a string completa (deve incluir `pooler.supabase.com` no host).
6. Cola em **`DATABASE_URL`** no `.env` (uma linha só). Guarda o ficheiro.
7. `npm run check:dns` → deve aparecer `DNS_OK`; depois `npm run check:db` → `DB_OK`.

Se **mesmo o host `*.pooler.supabase.com`** falhar no `nslookup`, aí é rede/firewall/VPN — experimenta outra rede ou `ipconfig /flushdns`.

### Erro **28P01** com URI que parece `...:[chO5K5...` ou `...[YOUR-PASSWORD]...`

No painel do Supabase os colchetes **`[` `]`** são **só exemplo** (placeholder). **Não podem** ficar na `DATABASE_URL` real — a password tem de ir **sem** colchetes, ou usa o botão **Copy** da URI no **Connect** (já vem certo).

### Depois de **reset da senha** e erro **28P01**

As senhas geradas costumam ter `+`, `@`, `%`, etc. Na URI isso tem de estar **codificado**; se montares a string à mão, falha.

1. No `.env`, define **temporariamente** (valores do Connect → Transaction):
   - `SUPABASE_POOLER_HOST=…` (ex.: `aws-1-us-east-1.pooler.supabase.com`)
   - `SUPABASE_DB_USER=postgres.TEU_REF`
   - `SUPABASE_DB_PASSWORD=` a senha **em texto puro**, como o Supabase mostrou
2. Correr: `npm run compose:database-url`
3. Copiar a linha **`DATABASE_URL=...`** que aparece para o `.env` (substituir a antiga; evita aspas à volta da URI).
4. `npm run check:db` → esperado **`DB_OK`**.

## 7. Próximos passos do cronograma

- Autenticação (Supabase Auth) e rotas internas do dashboard.
- Assinatura HMAC por integração em `packages/integrations` e normalização para evento canônico.

## 11. Operação e produção (checklist)

- Checklist de go-live: [`docs/PRODUCAO_CHECKLIST.md`](docs/PRODUCAO_CHECKLIST.md)
- Runbook de incidentes: [`docs/RUNBOOK_OPERACAO.md`](docs/RUNBOOK_OPERACAO.md)
- Backup e restore: [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md)

## 9. Smoke tests rápidos

Com API no ar:

```bash
npm run smoke:adapters
npm run smoke:api
```

Ou tudo junto:

```bash
npm run smoke
```

Pipeline fim-a-fim (webhook -> evento -> worker -> tentativa):

```bash
WEBHOOK_TEST_URL="..." WEBHOOK_SMOKE_TENANT_ID="..." npm run smoke:pipeline
```

Observações:

- `smoke:adapters` valida verify + parse de Hotmart/Kiwify/Hubla sem chamar serviço externo.
- `smoke:api` valida `GET /health` e, se `SMOKE_TENANT_ID` estiver definido, também valida `GET /recovery-attempts/summary`.

## 10. Limites por tenant (Etapa seguinte)

Nomes comerciais dos planos (Essencial, Growth, Scale), preços e lista de entregáveis exibidos na LP estão espelhados em **`docs/PRECIFICACAO.md`** — use esse arquivo para alinhar copy com o que a página promete; os números abaixo são os **limites técnicos** no banco.

Os limites de plano ficam na tabela `tenants`:

- `plan_monthly_events_limit`: máximo de eventos webhook aceitos por mês.
- `plan_monthly_recovery_limit`: máximo de tentativas de recuperação por mês.
- `billing_plan`: código comercial opcional (`essential`, `growth`, `scale`), alinhado à LP e ao metadata Stripe `re_plan`.

Valores padrão por tier (quando `re_plan` vem no checkout) estão em `docs/PRECIFICACAO.md` (tabela “Limites técnicos”). Aplique migrações após puxar o código: `npm run db:migrate -w @re/db` (inclui coluna `billing_plan`).

Comportamento:

- API webhook retorna `429 tenant_monthly_event_limit_exceeded` quando exceder o limite de eventos.
- Worker grava tentativa `failed` com `reason=tenant_monthly_recovery_limit_exceeded` quando exceder o limite de recuperação.

### Ajustar limites via API (sem SQL manual)

Defina no `.env`:

```env
ADMIN_API_TOKEN=seu_token_admin
```

Consultar limites:

```bash
curl -sS "http://127.0.0.1:3000/admin/tenants/SEU_TENANT_ID/limits" \
  -H "X-Admin-Token: $ADMIN_API_TOKEN"
```

Atualizar limites:

```bash
curl -sS -X PATCH "http://127.0.0.1:3000/admin/tenants/SEU_TENANT_ID/limits" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_API_TOKEN" \
  -d '{"planMonthlyEventsLimit":15000,"planMonthlyRecoveryLimit":300,"billingPlan":"growth"}'
```

Resumo mensal para auditoria de uso/cobrança:

```bash
USAGE_REPORT_TENANT_ID=SEU_TENANT_ID USAGE_REPORT_MONTH=2026-04 npm run report:usage
```

## 8. O que **não** é necessário no dia 1

- Nome final da marca ou escopo npm (`@re/*` pode permanecer interno).
- Domínio próprio ou Vercel/Railway, até o primeiro deploy.

---

*Identidade do produto em runtime: `getAppIdentity()` em `@re/app-config`.*

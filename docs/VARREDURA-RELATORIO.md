# Relatório de varredura geral — Recovery Engine Brasil

Data da execução inicial: 2026-04-11. Última atualização: correções de vulnerabilidades e gaps (mesmo documento).

## Resumo executivo

A stack segue **defesa em profundidade** alinhada a `PROJETO.md`. Após o relatório inicial, foram aplicadas **correções concretas**: upgrade de **`drizzle-orm`** (GHSA de identificadores SQL), **`/health/ready`** sem vazamento de infra em produção quando `HEALTH_READY_TOKEN` não está definido, comparação **tempo-constante** para `x-admin-token` / segredo webhook genérico, **`lint`** real via `tsc --noEmit` em todos os workspaces, **`overrides`** de `esbuild` na raiz, e deduplicação de **`vite`** no projeto `recovery-engine/`.

Riscos residuais: **`npm audit`** pode ainda listar **esbuild** aninhado em `drizzle-kit` → `@esbuild-kit/core-utils` (ferramenta de **dev**; o npm não aplica sempre override ao pacote aninhado). Tratar com atualização futura do `drizzle-kit` ou lockfile limpo. **Membership órfã** no Postgres: rever com `npm run audit:memberships` e corrigir dados manualmente se necessário.

---

## Correções aplicadas (referência rápida)

| Área | Alteração |
|------|-----------|
| Supply chain | [`packages/db/package.json`](../packages/db/package.json): `drizzle-orm` ^0.45.2; raiz [`package.json`](../package.json): `overrides.esbuild` ^0.25.12 |
| Health | [`apps/api/src/routes/health.ts`](../apps/api/src/routes/health.ts): em produção, sem `HEALTH_READY_TOKEN`, resposta mínima `{ ok, ready }` |
| Tokens admin / webhook | [`apps/api/src/lib/secure-token-compare.ts`](../apps/api/src/lib/secure-token-compare.ts) + uso em [`dashboard-auth.ts`](../apps/api/src/auth/dashboard-auth.ts), [`conversion-messaging.ts`](../apps/api/src/routes/conversion-messaging.ts), [`webhook-generic-policy.ts`](../apps/api/src/lib/webhook-generic-policy.ts) |
| Documentação | [`INICIAR.md`](../INICIAR.md), [`.env.example`](../.env.example) — comportamento de health em prod vs dev |
| SQL RLS | [`packages/db/sql/012_recovery_links.sql`](../packages/db/sql/012_recovery_links.sql) — `CREATE TYPE` idempotente (já aplicado na varredura anterior) |
| Lint | Scripts `lint` = `tsc --noEmit` (ou `tsc -b --noEmit` em `@re/web`) em workspaces |
| recovery-engine | [`recovery-engine/package.json`](../recovery-engine/package.json): `vite` só em `devDependencies` |
| Testes | [`apps/api/src/lib/secure-token-compare.test.ts`](../apps/api/src/lib/secure-token-compare.test.ts) |

---

## Comandos de verificação (atualizado)

| Comando | Resultado esperado |
|---------|-------------------|
| `npm run build` | OK |
| `npm run lint` | OK (TypeScript em todos os workspaces) |
| `npm run test:api` | 24+ testes passando |
| `npm audit` | Sem **high** críticos no runtime; podem persistir **moderate** na cadeia dev do `drizzle-kit` |
| `npm run check:db` / `npm run db:rls` | Conforme ambiente |

---

## 1. Documentos e variáveis de ambiente

- **`INICIAR.md`** e **`.env.example`**: produção sem `HEALTH_READY_TOKEN` não expõe `database` / `redis` / `queue` em `/health/ready`; com token, detalhe só com Bearer ou `X-Health-Token` válidos; em desenvolvimento, sem token, detalhe pode ser mostrado para debug.

---

## 2. API HTTP (`apps/api`)

- Borda: CORS, rate limit, Helmet, body limit, redaction no logger.
- Dashboard: tenant efetivo + membership; rotas admin com `assertTenantManagementAccess`; `/conversion/*` com `ADMIN_API_TOKEN` (comparação segura).
- Webhooks: ingress, Stripe, política genérica com comparação segura do segredo.

Testes incluem `resolveDashboardTenantId` (IDOR) em [`dashboard-auth.test.ts`](../apps/api/src/auth/dashboard-auth.test.ts).

---

## 3. Worker e fila

- Sem alterações estruturais nesta correção; fila BullMQ com `jobId` por evento.

---

## 4. Front (`apps/web`)

- Tokens via Supabase; `localStorage` só para preferências de UI; não colocar segredos em `VITE_*`.

---

## 5. Dados e RLS

- Reexecutar `npm run audit:memberships` para listar memberships órfãs e alinhar tenant ↔ utilizador no Supabase/Postgres.

---

## 6. Integrações

- `smoke:adapters` na raiz para regressão.

---

## 7. Scripts

- Scripts operacionais continuam a depender só de env; sem credenciais no repositório.

---

## 8. Projeto `recovery-engine/`

- `vite` deduplicado (apenas `devDependencies`).

---

## 9. Supply chain (`npm audit`)

| Item | Estado |
|------|--------|
| `drizzle-orm` ≥ 0.45.2 | Corrigido no pacote `@re/db` |
| `vite` (apps/web) | Atualizado no lockfile (ex.: 7.3.x) após `npm audit fix` |
| `esbuild` via `drizzle-kit` | Pode permanecer **moderate** no relatório do npm até o ecossistema `drizzle-kit` remover dependência legada; impacto limitado ao **CLI** / dev |

---

## 10. Próximos passos opcionais

1. Quando existir `drizzle-kit` sem `@esbuild-kit/core-utils` antigo, rever `npm audit`.
2. Resolver memberships órfãs após `audit:memberships`.
3. ESLint opcional além de `tsc --noEmit` (regras de estilo).
4. Suíte E2E (Playwright/Cypress) para fluxos críticos do dashboard.

---

*Documento interno; não substitui auditoria externa nem testes de intrusão em ambientes não autorizados.*

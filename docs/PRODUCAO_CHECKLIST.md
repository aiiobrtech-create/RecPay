# Checklist de Produção

Checklist objetivo para liberar o Recovery Engine Brasil em produção.

## Segurança

- `DASHBOARD_AUTH_REQUIRED=true` e `VITE_DASHBOARD_AUTH_REQUIRED=true`.
- `SUPABASE_SERVICE_ROLE_KEY` apenas em API/worker (nunca no browser).
- `CORS_ORIGINS` apenas com domínios reais de produção.
- `ADMIN_API_TOKEN` forte e rotacionável.
- Webhooks com segredo/token por provedor (`HOTMART_*`, `KIWIFY_*`, `HUBLA_*`).
- Logs sem tokens/sigilos (headers sensíveis redigidos no logger).

## Banco e Multi-tenant

- `npm run db:push -w @re/db` em staging/prod conforme fluxo definido.
- `npm run db:rls` aplicado e validado.
- `npm run audit:memberships` sem órfãos antes de go-live.
- Cenário cross-tenant testado (usuário A não acessa tenant B).
- Backup automático ativo e restore testado (ver `docs/BACKUP_RESTORE.md`).

## Runtime

- `npm run check:db` retornando `DB_OK`.
- `npm run check:queue` com fila saudável.
- `GET /health` e `GET /health/ready` verdes.
- API + worker + web estáveis com `npm run dev` em staging.

## Pipeline de eventos

- `npm run smoke:adapters` verde.
- `npm run smoke:api` verde (ou `SKIP` com justificativa de auth e token ausente).
- `npm run smoke:pipeline` verde em tenant de teste.

## Operação

- Runbook de incidentes pronto (`docs/RUNBOOK_OPERACAO.md`).
- Responsável on-call definido.
- Alertas mínimos configurados:
  - crescimento de fila
  - erro de webhook por provedor
  - taxa de falha do worker acima do normal

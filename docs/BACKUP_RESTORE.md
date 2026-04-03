# Backup e Restore (Operacional)

Guia curto para validar recuperação do banco antes do go-live.

## Objetivo

Garantir que o time consegue restaurar dados críticos com tempo previsível.

## Backup

- Usar backup automático do provedor (Supabase/Postgres gerenciado).
- Definir periodicidade e retenção mínima.
- Registrar local e responsável pela política.

## Teste de restore (obrigatório)

1. Escolher snapshot recente.
2. Restaurar em ambiente não produtivo.
3. Executar verificações:
   - `npm run check:db`
   - query de contagem em `tenants`, `events`, `recovery_attempts`
   - `npm run smoke:api`
4. Registrar tempo total de recuperação.
5. Atualizar runbook com lições aprendidas.

## Critério de aprovação

- Restore concluído sem erro.
- Dados essenciais íntegros.
- APIs principais respondendo normalmente após restore.

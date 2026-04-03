# Runbook de Operação

## 1) API indisponível

1. Verificar `GET /health` e `GET /health/ready`.
2. Confirmar `DATABASE_URL` e `REDIS_URL` no ambiente.
3. Rodar `npm run check:db` e `npm run check:queue`.
4. Se `check:db` falhar: revisar DNS/pooler Supabase e credenciais.
5. Se `check:queue` falhar: validar Redis e reiniciar worker.

## 2) Fila crescendo sem consumo

1. Rodar `npm run check:queue`.
2. Conferir logs do worker para jobs `failed`.
3. Verificar conectividade Redis e se worker está online.
4. Confirmar se houve mudança de segredo de webhook/canal externo.
5. Corrigir causa e monitorar queda do backlog.

## 3) Webhooks com falha de assinatura

1. Identificar provedor e headers recebidos.
2. Confirmar segredo/token no `.env` (`HOTMART_*`, `KIWIFY_*`, `HUBLA_*`).
3. Validar se houve rotação recente no provedor.
4. Executar teste manual com payload assinado.
5. Registrar incidente e ação corretiva.

## 4) Acesso indevido entre tenants (incidente crítico)

1. Bloquear operação sensível imediatamente.
2. Coletar evidências (request_id, tenant_id, user_id).
3. Revisar membership do usuário e filtro de tenant na rota.
4. Auditar políticas RLS das tabelas envolvidas.
5. Corrigir, testar cross-tenant e comunicar impacto.

## 5) Rotação de segredos

1. Gerar novo segredo no provedor.
2. Atualizar variável no ambiente de destino.
3. Reiniciar API/worker com janela controlada.
4. Validar webhook de teste.
5. Revogar segredo antigo.

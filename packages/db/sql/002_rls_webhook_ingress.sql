-- Habilitar RLS na tabela de tokens de ingresso (acesso apenas via conexão backend / role que ignora RLS).
ALTER TABLE webhook_ingress_tokens ENABLE ROW LEVEL SECURITY;

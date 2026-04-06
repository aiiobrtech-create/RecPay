-- RLS para faturamento multi-tenant.
-- Mantemos leitura por membros do tenant; escrita deve continuar via backend/service role.

ALTER TABLE billing_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_statements_select_member ON billing_statements;
CREATE POLICY billing_statements_select_member ON billing_statements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = billing_statements.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS billing_events_select_member ON billing_events;
CREATE POLICY billing_events_select_member ON billing_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = billing_events.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS charge_attempts_select_member ON charge_attempts;
CREATE POLICY charge_attempts_select_member ON charge_attempts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM billing_statements bs
      JOIN memberships m
        ON m.tenant_id = bs.tenant_id
      WHERE bs.id = charge_attempts.billing_statement_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

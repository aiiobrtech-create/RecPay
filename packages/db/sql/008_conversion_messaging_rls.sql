-- RLS para mensagens de conversão / fluxos de recuperação (multi-tenant via memberships).

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_templates_select_member ON message_templates;
CREATE POLICY message_templates_select_member ON message_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = message_templates.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS message_variants_select_member ON message_variants;
CREATE POLICY message_variants_select_member ON message_variants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = message_variants.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS recovery_flows_select_member ON recovery_flows;
CREATE POLICY recovery_flows_select_member ON recovery_flows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = recovery_flows.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS message_approvals_select_member ON message_approvals;
CREATE POLICY message_approvals_select_member ON message_approvals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = message_approvals.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS conversion_attributions_select_member ON conversion_attributions;
CREATE POLICY conversion_attributions_select_member ON conversion_attributions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = conversion_attributions.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS recovery_flows_tenant_trigger_idx
  ON recovery_flows (tenant_id, trigger_event_type)
  WHERE enabled = true;

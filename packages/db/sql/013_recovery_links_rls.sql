ALTER TABLE recovery_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recovery_links_select_member ON recovery_links;
CREATE POLICY recovery_links_select_member ON recovery_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = recovery_links.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS recovery_links_tenant_trigger_idx
  ON recovery_links (tenant_id, trigger_event_type)
  WHERE active = true AND approval_status = 'approved';

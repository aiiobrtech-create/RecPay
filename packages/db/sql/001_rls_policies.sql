-- Supabase: pressupõe auth.users e auth.uid(). Aplicar após schema Drizzle (via CLI: npm run db:rls na raiz).
-- Conexão: DATABASE_URL (pooler ou direct). Reexecutar o script é seguro (idempotente).

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memberships_select_own ON memberships;
CREATE POLICY memberships_select_own ON memberships
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS tenants_select_member ON tenants;
CREATE POLICY tenants_select_member ON tenants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = tenants.id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS events_select_member ON events;
CREATE POLICY events_select_member ON events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = events.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

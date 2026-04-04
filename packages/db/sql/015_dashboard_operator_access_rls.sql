ALTER TABLE dashboard_operator_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_operator_access_select_self ON dashboard_operator_access;
CREATE POLICY dashboard_operator_access_select_self ON dashboard_operator_access
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

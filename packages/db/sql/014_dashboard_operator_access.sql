CREATE TABLE IF NOT EXISTS dashboard_operator_access (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  granted_by text,
  note text
);

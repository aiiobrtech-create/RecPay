CREATE TYPE recovery_link_approval_status AS ENUM ('pending_review', 'approved', 'rejected');

CREATE TABLE IF NOT EXISTS recovery_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  platform text,
  trigger_event_type text,
  product_name text,
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  approval_status recovery_link_approval_status NOT NULL DEFAULT 'pending_review',
  approval_note text,
  submitted_by text,
  reviewed_by text,
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS recovery_links_tenant_lookup_idx
  ON recovery_links (tenant_id, approval_status, active, priority DESC, updated_at DESC);

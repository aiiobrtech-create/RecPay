ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS integration_configs jsonb;

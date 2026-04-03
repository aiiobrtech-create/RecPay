-- Limites por plano de tenant (mensal) aplicados em API/worker.
ALTER TABLE IF EXISTS tenants
  ADD COLUMN IF NOT EXISTS plan_monthly_events_limit integer;

ALTER TABLE IF EXISTS tenants
  ADD COLUMN IF NOT EXISTS plan_monthly_recovery_limit integer;

-- Configurações self-service por tenant para dashboard (MVP local).
ALTER TABLE IF EXISTS tenants
  ADD COLUMN IF NOT EXISTS recovery_contact_cooldown_minutes integer;

ALTER TABLE IF EXISTS tenants
  ADD COLUMN IF NOT EXISTS recovery_contact_max_attempts_per_day integer;

ALTER TABLE IF EXISTS tenants
  ADD COLUMN IF NOT EXISTS recovery_channel_mode text;

ALTER TABLE IF EXISTS tenants
  ADD COLUMN IF NOT EXISTS webhook_provider_preferred text;

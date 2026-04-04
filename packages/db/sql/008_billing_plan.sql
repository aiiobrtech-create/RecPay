-- Plano comercial (metadata Stripe `re_plan`: essential, growth, scale). Opcional; enforcement continua nos limites numéricos.
ALTER TABLE IF EXISTS tenants
  ADD COLUMN IF NOT EXISTS billing_plan text;

COMMENT ON COLUMN tenants.billing_plan IS 'Código do plano: essential | growth | scale (alinhado à LP).';

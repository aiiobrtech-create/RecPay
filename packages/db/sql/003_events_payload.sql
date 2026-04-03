-- Compatibilidade para ambiente onde drizzle-kit push fica preso em introspecção.
-- Mantém schema alinhado com packages/db/src/schema.ts para suportar payload bruto do webhook.
ALTER TABLE IF EXISTS events
  ADD COLUMN IF NOT EXISTS payload jsonb;

-- Tentativas de recuperação criadas pelo worker para eventos de pagamento falho.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'recovery_attempt_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.recovery_attempt_status AS ENUM ('scheduled', 'simulated_sent', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS recovery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  status public.recovery_attempt_status NOT NULL DEFAULT 'scheduled',
  reason text,
  meta jsonb,
  executed_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recovery_attempts_event_unique'
  ) THEN
    ALTER TABLE recovery_attempts
      ADD CONSTRAINT recovery_attempts_event_unique UNIQUE (event_id);
  END IF;
END $$;

ALTER TABLE recovery_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recovery_attempts_select_member ON recovery_attempts;
CREATE POLICY recovery_attempts_select_member ON recovery_attempts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = recovery_attempts.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

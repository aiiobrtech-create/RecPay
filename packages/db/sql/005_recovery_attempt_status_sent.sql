-- Permite distinguir tentativa realmente enviada pelo provedor (Evolution API).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'recovery_attempt_status'
      AND n.nspname = 'public'
  ) THEN
    ALTER TYPE public.recovery_attempt_status ADD VALUE IF NOT EXISTS 'sent' BEFORE 'failed';
  END IF;
END $$;

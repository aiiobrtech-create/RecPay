ALTER TABLE IF EXISTS tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_default_payment_method_id text,
  ADD COLUMN IF NOT EXISTS monthly_fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_fee_bps integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS billing_cycle_anchor_day integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_event_status') THEN
    CREATE TYPE billing_event_status AS ENUM ('billable', 'billed', 'reversed', 'ignored', 'disputed');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_statement_status') THEN
    CREATE TYPE billing_statement_status AS ENUM ('draft', 'finalized', 'paid', 'payment_failed');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'charge_attempt_status') THEN
    CREATE TYPE charge_attempt_status AS ENUM ('pending', 'paid', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS billing_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  recovered_total_cents integer NOT NULL DEFAULT 0,
  commission_total_cents integer NOT NULL DEFAULT 0,
  monthly_fee_cents integer NOT NULL DEFAULT 0,
  grand_total_cents integer NOT NULL DEFAULT 0,
  status billing_statement_status NOT NULL DEFAULT 'draft',
  generated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  charged_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_statements_period_unique
  ON billing_statements (tenant_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  external_reference text NOT NULL,
  debtor_reference text,
  recovered_amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  occurred_at timestamptz NOT NULL,
  commission_rate_bps integer NOT NULL,
  commission_amount_cents integer NOT NULL,
  status billing_event_status NOT NULL DEFAULT 'billable',
  billing_statement_id uuid REFERENCES billing_statements(id) ON DELETE SET NULL,
  reversal_of_billing_event_id uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_source_event_unique
  ON billing_events (source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_tenant_external_reference_unique
  ON billing_events (tenant_id, external_reference);

CREATE TABLE IF NOT EXISTS charge_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  billing_statement_id uuid NOT NULL REFERENCES billing_statements(id) ON DELETE CASCADE,
  payment_gateway text NOT NULL,
  external_charge_id text,
  amount_cents integer NOT NULL,
  status charge_attempt_status NOT NULL DEFAULT 'pending',
  failure_reason text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

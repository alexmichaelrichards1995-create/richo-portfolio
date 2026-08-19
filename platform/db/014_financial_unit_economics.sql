CREATE TABLE IF NOT EXISTS richo_financial_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  currency text NOT NULL DEFAULT 'AUD',
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS richo_financial_snapshots_subject_idx ON richo_financial_snapshots(subject_type, subject_id, period_end DESC);

CREATE TABLE IF NOT EXISTS richo_cost_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_type text NOT NULL,
  provider text,
  product_id text,
  agent_id text,
  amount numeric(18,4) NOT NULL,
  currency text NOT NULL DEFAULT 'AUD',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS richo_cost_ledger_time_idx ON richo_cost_ledger(occurred_at DESC, cost_type);

CREATE TABLE IF NOT EXISTS richo_revenue_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_type text NOT NULL,
  external_id text,
  product_id text,
  customer_id text,
  gross_amount numeric(18,4) NOT NULL,
  refund_amount numeric(18,4) NOT NULL DEFAULT 0,
  fee_amount numeric(18,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'AUD',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(revenue_type, external_id)
);

CREATE TABLE IF NOT EXISTS richo_financial_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

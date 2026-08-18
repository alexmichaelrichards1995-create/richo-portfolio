CREATE TABLE IF NOT EXISTS richo_integration_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name text NOT NULL,
  state text NOT NULL,
  circuit_state text,
  latency_ms integer,
  error jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS richo_integration_health_name_time_idx
  ON richo_integration_health(integration_name, checked_at DESC);

CREATE TABLE IF NOT EXISTS richo_reconciliation_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_result jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS richo_reconciliation_targets_due_idx
  ON richo_reconciliation_targets(enabled, next_run_at);

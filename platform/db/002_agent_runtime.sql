-- R.I.C.H.O. Persistent Autonomous Runtime V1
-- Durable state, queues, leases, retries, budgets, heartbeats and execution evidence.

CREATE TABLE IF NOT EXISTS richo_agent_state (
  agent_id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  mode TEXT NOT NULL DEFAULT 'event_driven',
  current_job_id UUID,
  last_heartbeat_at TIMESTAMPTZ,
  last_started_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,
  last_error JSONB,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  daily_budget_cents INTEGER NOT NULL DEFAULT 0,
  daily_spend_cents INTEGER NOT NULL DEFAULT 0,
  budget_reset_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_agent_jobs (
  id UUID PRIMARY KEY,
  section_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  operation TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'queued',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  idempotency_key TEXT,
  correlation_id UUID,
  causation_id UUID,
  result JSONB,
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS richo_agent_jobs_idempotency_idx
  ON richo_agent_jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS richo_agent_jobs_claim_idx
  ON richo_agent_jobs(status, available_at, priority, created_at);

CREATE INDEX IF NOT EXISTS richo_agent_jobs_lease_idx
  ON richo_agent_jobs(lease_expires_at)
  WHERE status = 'running';

CREATE TABLE IF NOT EXISTS richo_agent_run_receipts (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES richo_agent_jobs(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  run_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  policy_decision TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms BIGINT,
  input_hash TEXT,
  output_hash TEXT,
  usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS richo_agent_run_receipts_job_idx
  ON richo_agent_run_receipts(job_id, run_number);

CREATE TABLE IF NOT EXISTS richo_agent_schedules (
  id UUID PRIMARY KEY,
  section_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  cron_expression TEXT,
  interval_seconds INTEGER,
  enabled BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cron_expression IS NOT NULL OR interval_seconds IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS richo_agent_budget_ledger (
  id UUID PRIMARY KEY,
  agent_id TEXT NOT NULL,
  job_id UUID,
  provider TEXT,
  model TEXT,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  actual_cost_cents INTEGER,
  input_tokens BIGINT,
  output_tokens BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS richo_agent_budget_ledger_agent_idx
  ON richo_agent_budget_ledger(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS richo_agent_health_events (
  id UUID PRIMARY KEY,
  agent_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  health_state TEXT NOT NULL,
  check_name TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS richo_agent_health_events_agent_idx
  ON richo_agent_health_events(agent_id, recorded_at DESC);

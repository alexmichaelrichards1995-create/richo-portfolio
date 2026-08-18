BEGIN;

CREATE TABLE IF NOT EXISTS richo_agent_schedules (
  id UUID PRIMARY KEY,
  section_id TEXT NOT NULL,
  agent_id TEXT,
  trigger_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 100,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  cadence_seconds INTEGER NOT NULL CHECK (cadence_seconds >= 60),
  next_run_at TIMESTAMPTZ NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_richo_agent_schedules_due
  ON richo_agent_schedules (next_run_at)
  WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_richo_agent_jobs_claim
  ON richo_agent_jobs (priority, available_at, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_richo_agent_jobs_lease
  ON richo_agent_jobs (lease_expires_at)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_richo_agent_jobs_status_created
  ON richo_agent_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_richo_agent_receipts_job
  ON richo_agent_receipts (job_id, run_number DESC);

COMMIT;

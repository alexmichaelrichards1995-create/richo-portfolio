BEGIN;

ALTER TABLE richo_agent_schedules
  ADD COLUMN IF NOT EXISTS trigger TEXT,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;

UPDATE richo_agent_schedules
SET trigger = COALESCE(trigger, 'schedule.tick')
WHERE trigger IS NULL;

ALTER TABLE richo_agent_schedules
  ALTER COLUMN trigger SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_richo_agent_schedules_due
  ON richo_agent_schedules (next_run_at)
  WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_richo_agent_jobs_status_created
  ON richo_agent_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_richo_agent_jobs_claim_v2
  ON richo_agent_jobs (priority, available_at, created_at)
  WHERE status = 'queued';

COMMIT;

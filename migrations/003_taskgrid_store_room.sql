BEGIN;

CREATE TABLE IF NOT EXISTS taskgrid_tasks (
  task_id TEXT PRIMARY KEY,
  notion_page_id TEXT UNIQUE,
  task_name TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL CHECK (status IN ('Ready','Running','Waiting Approval','Succeeded','No Change','Failed','Paused')),
  task_type TEXT NOT NULL CHECK (task_type IN ('Connector','HTTP','Local','Condition Watch','Owner Action')),
  cadence TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ChatGPT Dispatcher',
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  owner_approved BOOLEAN NOT NULL DEFAULT FALSE,
  instruction TEXT,
  next_due TIMESTAMPTZ,
  last_run TIMESTAMPTZ,
  last_result TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taskgrid_due
  ON taskgrid_tasks(enabled, status, priority, next_due);

CREATE TABLE IF NOT EXISTS taskgrid_leases (
  task_id TEXT PRIMARY KEY REFERENCES taskgrid_tasks(task_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_taskgrid_leases_expiry ON taskgrid_leases(expires_at);

CREATE TABLE IF NOT EXISTS taskgrid_runs (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES taskgrid_tasks(task_id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  state TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_taskgrid_runs_task_time ON taskgrid_runs(task_id, started_at DESC);

CREATE TABLE IF NOT EXISTS taskgrid_dead_letters (
  id BIGSERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  classification TEXT NOT NULL,
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_taskgrid_dead_letters_task_time ON taskgrid_dead_letters(task_id, created_at DESC);

COMMIT;

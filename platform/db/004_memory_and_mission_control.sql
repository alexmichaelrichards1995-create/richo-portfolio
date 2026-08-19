BEGIN;

CREATE TABLE IF NOT EXISTS richo_memory_items (
  id UUID PRIMARY KEY,
  section_id TEXT,
  agent_id TEXT,
  memory_type TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  title TEXT,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  importance NUMERIC(5,2) NOT NULL DEFAULT 0,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 1,
  source_type TEXT,
  source_id TEXT,
  correlation_id UUID,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  superseded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS richo_memory_section_idx ON richo_memory_items(section_id, created_at DESC);
CREATE INDEX IF NOT EXISTS richo_memory_subject_idx ON richo_memory_items(subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS richo_memory_agent_idx ON richo_memory_items(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS richo_memory_links (
  id UUID PRIMARY KEY,
  from_memory_id UUID NOT NULL REFERENCES richo_memory_items(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  to_memory_id UUID NOT NULL REFERENCES richo_memory_items(id) ON DELETE CASCADE,
  weight NUMERIC(5,2) NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS richo_memory_links_unique_idx
  ON richo_memory_links(from_memory_id, relation, to_memory_id);

CREATE TABLE IF NOT EXISTS richo_operator_commands (
  id UUID PRIMARY KEY,
  section_id TEXT,
  agent_id TEXT,
  command TEXT NOT NULL,
  requested_state TEXT,
  reason TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS richo_operator_commands_section_idx
  ON richo_operator_commands(section_id, created_at DESC);

CREATE TABLE IF NOT EXISTS richo_section_control (
  section_id TEXT PRIMARY KEY,
  desired_state TEXT NOT NULL DEFAULT 'running',
  effective_state TEXT NOT NULL DEFAULT 'idle',
  pause_reason TEXT,
  last_changed_by TEXT,
  last_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMIT;

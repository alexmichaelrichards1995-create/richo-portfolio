CREATE TABLE IF NOT EXISTS richo_knowledge_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL,
  external_key text,
  label text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(node_type, external_key)
);

CREATE TABLE IF NOT EXISTS richo_knowledge_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id uuid NOT NULL REFERENCES richo_knowledge_nodes(id) ON DELETE CASCADE,
  relation text NOT NULL,
  to_node_id uuid NOT NULL REFERENCES richo_knowledge_nodes(id) ON DELETE CASCADE,
  confidence numeric(5,4) NOT NULL DEFAULT 1.0,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_node_id, relation, to_node_id)
);

CREATE INDEX IF NOT EXISTS richo_knowledge_edges_from_idx ON richo_knowledge_edges(from_node_id, relation);
CREATE INDEX IF NOT EXISTS richo_knowledge_edges_to_idx ON richo_knowledge_edges(to_node_id, relation);

CREATE TABLE IF NOT EXISTS richo_outcome_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  unit text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('higher_is_better','lower_is_better','target')),
  target_value numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(metric_key, subject_type, subject_id)
);

CREATE TABLE IF NOT EXISTS richo_outcome_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid NOT NULL REFERENCES richo_outcome_metrics(id) ON DELETE CASCADE,
  value numeric NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  correlation_id text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS richo_outcome_observations_metric_time_idx ON richo_outcome_observations(metric_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS richo_improvement_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id text NOT NULL,
  agent_id text,
  title text NOT NULL,
  hypothesis text NOT NULL,
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','running','measuring','succeeded','failed','inconclusive','rolled_back')),
  risk text NOT NULL DEFAULT 'low',
  approval_id uuid,
  correlation_id text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_experiment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES richo_improvement_experiments(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  baseline_value numeric,
  final_value numeric,
  delta numeric,
  delta_percent numeric,
  verdict text NOT NULL CHECK (verdict IN ('improved','regressed','unchanged','insufficient_data')),
  confidence numeric(5,4),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

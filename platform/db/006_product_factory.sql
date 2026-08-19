CREATE TABLE IF NOT EXISTS richo_product_factory_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL,
  title text NOT NULL,
  opportunity jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_customer jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'researching' CHECK (status IN ('researching','architecting','building','designing','qa','security_review','packaging','awaiting_release_approval','released','blocked','failed')),
  current_stage text NOT NULL DEFAULT 'research',
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_product_factory_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_run_id uuid NOT NULL REFERENCES richo_product_factory_runs(id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  artifact_key text NOT NULL,
  version text NOT NULL DEFAULT '1.0.0',
  status text NOT NULL DEFAULT 'draft',
  uri text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(factory_run_id, artifact_type, artifact_key, version)
);

CREATE TABLE IF NOT EXISTS richo_product_factory_stage_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_run_id uuid NOT NULL REFERENCES richo_product_factory_runs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  agent_id text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  quality_score numeric(6,3),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  error jsonb,
  UNIQUE(factory_run_id, stage, agent_id)
);

CREATE TABLE IF NOT EXISTS richo_product_release_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_run_id uuid NOT NULL REFERENCES richo_product_factory_runs(id) ON DELETE CASCADE,
  version text NOT NULL,
  changelog jsonb NOT NULL DEFAULT '[]'::jsonb,
  readiness_score numeric(6,3),
  qa_status text NOT NULL DEFAULT 'pending',
  security_status text NOT NULL DEFAULT 'pending',
  demo_status text NOT NULL DEFAULT 'pending',
  docs_status text NOT NULL DEFAULT 'pending',
  commerce_status text NOT NULL DEFAULT 'pending',
  approval_status text NOT NULL DEFAULT 'pending',
  release_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(factory_run_id, version)
);

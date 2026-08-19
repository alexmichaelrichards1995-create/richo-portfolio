CREATE TABLE IF NOT EXISTS richo_causal_experiments (
 id uuid PRIMARY KEY,
 name text NOT NULL,
 hypothesis text NOT NULL,
 unit text NOT NULL,
 variants jsonb NOT NULL,
 primary_metric text NOT NULL,
 guardrails jsonb NOT NULL DEFAULT '[]'::jsonb,
 minimum_sample_size integer NOT NULL DEFAULT 100,
 confidence_threshold numeric(6,5) NOT NULL DEFAULT .95,
 max_duration_days integer NOT NULL DEFAULT 30,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','running','paused','completed','stopped')),
 analysis jsonb,
 causal_claim_allowed boolean NOT NULL DEFAULT false,
 correlation_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS richo_experiment_assignments (
 experiment_id uuid NOT NULL REFERENCES richo_causal_experiments(id) ON DELETE CASCADE,
 subject_hash text NOT NULL,
 variant_id text NOT NULL,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(experiment_id,subject_hash)
);
CREATE TABLE IF NOT EXISTS richo_experiment_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 experiment_id uuid NOT NULL REFERENCES richo_causal_experiments(id) ON DELETE CASCADE,
 variant_id text NOT NULL,
 metric_key text NOT NULL,
 metric_value numeric(20,8) NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS richo_validated_learnings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 experiment_id uuid REFERENCES richo_causal_experiments(id) ON DELETE SET NULL,
 learning_type text NOT NULL,
 conclusion text NOT NULL,
 effect numeric(20,8),
 relative_lift numeric(20,8),
 confidence numeric(8,7),
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

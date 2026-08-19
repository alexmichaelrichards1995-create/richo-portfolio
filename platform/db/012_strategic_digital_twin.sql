CREATE TABLE IF NOT EXISTS richo_strategic_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_key uuid NOT NULL UNIQUE,
  name text NOT NULL,
  baseline jsonb NOT NULL,
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  horizon_months integer NOT NULL CHECK (horizon_months > 0 AND horizon_months <= 120),
  scenarios jsonb NOT NULL,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_strategic_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  objective text NOT NULL,
  simulation_id uuid REFERENCES richo_strategic_simulations(id) ON DELETE SET NULL,
  owner_decision_id uuid,
  selected_scenario text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','proposed','approved','rejected','executing','measuring','completed','cancelled')),
  milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  guardrails jsonb NOT NULL DEFAULT '{}'::jsonb,
  success_metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS richo_strategic_plans_status_idx ON richo_strategic_plans(status, updated_at DESC);

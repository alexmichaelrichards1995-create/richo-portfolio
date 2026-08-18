CREATE TABLE IF NOT EXISTS richo_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  objective text NOT NULL,
  owner_decision_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('draft','approved','executing','at_risk','paused','completed','cancelled')),
  budget jsonb NOT NULL DEFAULT '{}'::jsonb,
  success_metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  guardrails jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES richo_portfolios(id) ON DELETE CASCADE,
  title text NOT NULL,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','blocked','completed','cancelled')),
  budget jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES richo_programs(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','blocked','completed','missed','cancelled')),
  acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_work_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES richo_programs(id) ON DELETE CASCADE,
  section_id text NOT NULL,
  agent_id text,
  title text NOT NULL,
  objective text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget jsonb NOT NULL DEFAULT '{}'::jsonb,
  due_at timestamptz,
  risk text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','blocked','awaiting_approval','completed','failed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_portfolio_variances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES richo_portfolios(id) ON DELETE CASCADE,
  variances jsonb NOT NULL,
  breached jsonb NOT NULL DEFAULT '[]'::jsonb,
  tolerance_pct numeric NOT NULL,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_corrective_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES richo_portfolios(id) ON DELETE CASCADE,
  variance jsonb NOT NULL,
  simulation jsonb,
  owner_decision_id uuid,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','awaiting_owner_decision','approved','rejected','executing','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS richo_programs_portfolio_idx ON richo_programs(portfolio_id, status);
CREATE INDEX IF NOT EXISTS richo_work_packages_program_idx ON richo_work_packages(program_id, status);
CREATE INDEX IF NOT EXISTS richo_variances_portfolio_idx ON richo_portfolio_variances(portfolio_id, created_at DESC);

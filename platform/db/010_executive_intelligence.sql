CREATE TABLE IF NOT EXISTS richo_executive_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_days integer NOT NULL,
  revenue jsonb NOT NULL DEFAULT '{}'::jsonb,
  memberships jsonb NOT NULL DEFAULT '{}'::jsonb,
  products jsonb NOT NULL DEFAULT '{}'::jsonb,
  conversion jsonb NOT NULL DEFAULT '{}'::jsonb,
  incidents jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_spend jsonb NOT NULL DEFAULT '{}'::jsonb,
  customers jsonb NOT NULL DEFAULT '{}'::jsonb,
  readiness jsonb NOT NULL DEFAULT '{}'::jsonb,
  health jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_owner_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  recommendation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','deferred','completed','expired')),
  decision_note text,
  decided_by text,
  decided_at timestamptz,
  deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS richo_owner_decisions_status_idx ON richo_owner_decisions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS richo_executive_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  severity text NOT NULL,
  message text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_executive_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  priority text NOT NULL,
  message text NOT NULL,
  suggested_action text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

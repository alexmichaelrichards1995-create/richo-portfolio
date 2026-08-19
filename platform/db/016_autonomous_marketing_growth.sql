CREATE TABLE IF NOT EXISTS richo_marketing_campaigns (
  id uuid PRIMARY KEY,
  product_id text,
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget numeric(18,4) NOT NULL DEFAULT 0,
  strategy jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_approval','approved','running','paused','completed','cancelled')),
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_marketing_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES richo_marketing_campaigns(id) ON DELETE CASCADE,
  format text NOT NULL,
  content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','published','rejected')),
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_marketing_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES richo_marketing_campaigns(id) ON DELETE CASCADE,
  channel text NOT NULL,
  spend numeric(18,4) NOT NULL DEFAULT 0,
  visits integer NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  customers integer NOT NULL DEFAULT 0,
  revenue numeric(18,4) NOT NULL DEFAULT 0,
  gross_profit numeric(18,4) NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS richo_marketing_attribution_campaign_idx ON richo_marketing_attribution(campaign_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS richo_growth_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES richo_marketing_campaigns(id) ON DELETE CASCADE,
  hypothesis text NOT NULL,
  variant_a jsonb NOT NULL,
  variant_b jsonb NOT NULL,
  primary_metric text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','measuring','won_a','won_b','inconclusive','stopped')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

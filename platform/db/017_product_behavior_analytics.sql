CREATE TABLE IF NOT EXISTS richo_product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  customer_id text,
  session_id text,
  product_id text,
  feature_key text,
  entitlement_id text,
  source text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  CHECK (customer_id IS NOT NULL OR session_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS richo_product_events_customer_time_idx ON richo_product_events(customer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS richo_product_events_product_time_idx ON richo_product_events(product_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS richo_product_events_event_time_idx ON richo_product_events(event_name, occurred_at DESC);

CREATE TABLE IF NOT EXISTS richo_product_funnel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text,
  funnel_key text NOT NULL,
  steps jsonb NOT NULL,
  results jsonb NOT NULL,
  window_start timestamptz,
  window_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_feature_adoption_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL,
  feature_key text NOT NULL,
  adopters integer NOT NULL DEFAULT 0,
  active_customers integer NOT NULL DEFAULT 0,
  adoption_rate numeric(8,6) NOT NULL DEFAULT 0,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_behavior_risk_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  product_id text,
  score numeric(8,4) NOT NULL,
  risk text NOT NULL CHECK (risk IN ('low','medium','high','critical')),
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);

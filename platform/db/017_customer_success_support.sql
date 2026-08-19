CREATE TABLE IF NOT EXISTS richo_customer_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL UNIQUE,
  health jsonb NOT NULL DEFAULT '{}'::jsonb,
  renewal_risk jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_customer_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  product_id text,
  membership jsonb NOT NULL DEFAULT '{}'::jsonb,
  entitlements jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','paused','cancelled')),
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text,
  customer_id text,
  subject text,
  body text,
  triage jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','escalated','awaiting_approval','resolved','closed')),
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS richo_support_tickets_status_idx ON richo_support_tickets(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS richo_customer_satisfaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  ticket_id uuid REFERENCES richo_support_tickets(id) ON DELETE SET NULL,
  score numeric(3,2) NOT NULL CHECK (score >= 0 AND score <= 5),
  comment text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_customer_success_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  correlation_id text
);

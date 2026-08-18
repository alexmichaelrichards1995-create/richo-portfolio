CREATE TABLE IF NOT EXISTS richo_products (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL,
  source TEXT NOT NULL,
  sku TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  price NUMERIC(14,2),
  currency CHAR(3) NOT NULL DEFAULT 'AUD',
  product_type TEXT NOT NULL DEFAULT 'digital',
  entitlements JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, external_id)
);

CREATE TABLE IF NOT EXISTS richo_events (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  correlation_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor JSONB NOT NULL,
  source TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS richo_events_type_time_idx ON richo_events(type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS richo_events_correlation_idx ON richo_events(correlation_id);

CREATE TABLE IF NOT EXISTS richo_ai_jobs (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,
  capability TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('low','medium','high','critical')),
  status TEXT NOT NULL,
  input JSONB NOT NULL,
  output JSONB,
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS richo_ai_jobs_status_idx ON richo_ai_jobs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS richo_approvals (
  id UUID PRIMARY KEY,
  action TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('low','medium','high','critical')),
  reason TEXT NOT NULL,
  requested_by JSONB,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decision JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS richo_approvals_pending_idx ON richo_approvals(status, created_at DESC);

CREATE TABLE IF NOT EXISTS richo_integrations (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mode TEXT NOT NULL DEFAULT 'sandbox',
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  health JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS richo_entitlements (
  id BIGSERIAL PRIMARY KEY,
  customer_ref TEXT NOT NULL,
  product_id BIGINT REFERENCES richo_products(id) ON DELETE CASCADE,
  membership_ref TEXT,
  entitlement_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(customer_ref, entitlement_key)
);

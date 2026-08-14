-- 002_create_paycore_revenue_core.sql
-- Minimal source-controlled PayCore payment truth required by Stripe intake and
-- the one-way PostHog revenue bridge. Production may contain additional PayCore
-- columns/tables; these CREATE IF NOT EXISTS statements are non-destructive.

CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  order_reference TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  net_minor BIGINT NOT NULL CHECK (net_minor >= 0),
  gst_minor BIGINT NOT NULL DEFAULT 0 CHECK (gst_minor >= 0),
  tax_mode TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  billing_type TEXT NOT NULL,
  state TEXT NOT NULL,
  provider TEXT,
  provider_object_id TEXT,
  provider_payment_intent_id TEXT,
  encrypted_customer JSONB,
  email_hash TEXT,
  ip_hash TEXT,
  risk JSONB NOT NULL DEFAULT '{}'::jsonb,
  qualification JSONB,
  fulfilment_state TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payment_attempts (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  provider TEXT NOT NULL,
  state TEXT NOT NULL,
  external_id TEXT,
  checkout_url TEXT,
  provider_status TEXT,
  route_score NUMERIC,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE TABLE IF NOT EXISTS webhook_receipts (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  kind TEXT,
  intent_id TEXT REFERENCES payment_intents(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  payload JSONB,
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE IF NOT EXISTS paycore_kv (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_provider_object
  ON payment_intents(provider, provider_object_id);

CREATE INDEX IF NOT EXISTS idx_payment_intents_provider_payment
  ON payment_intents(provider, provider_payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_payment_intents_succeeded
  ON payment_intents(succeeded_at)
  WHERE succeeded_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_receipts_status
  ON webhook_receipts(status, updated_at);

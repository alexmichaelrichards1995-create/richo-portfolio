-- R.I.C.H.O. PayCore v2.2.1 source-recovery schema
-- PostgreSQL 16+. Idempotent for recovery/bootstrap use.
-- Mirrors the currently deployed Neon PayCore contract used by checkout/webhooks.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS payment_intents (
  id text PRIMARY KEY,
  order_reference text NOT NULL UNIQUE,
  sku text NOT NULL,
  product_name text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  net_minor bigint NOT NULL CHECK (net_minor >= 0),
  gst_minor bigint NOT NULL DEFAULT 0 CHECK (gst_minor >= 0),
  tax_mode text NOT NULL,
  currency char(3) NOT NULL,
  billing_type text NOT NULL,
  state text NOT NULL,
  provider text,
  provider_object_id text,
  provider_payment_intent_id text,
  encrypted_customer jsonb,
  email_hash text,
  ip_hash text,
  risk jsonb NOT NULL DEFAULT '{}'::jsonb,
  qualification jsonb,
  fulfilment_state text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  succeeded_at timestamptz
);
CREATE INDEX IF NOT EXISTS payment_intents_state_idx ON payment_intents(state, updated_at);
CREATE INDEX IF NOT EXISTS payment_intents_provider_object_idx ON payment_intents(provider, provider_object_id);
CREATE INDEX IF NOT EXISTS payment_intents_provider_pi_idx ON payment_intents(provider, provider_payment_intent_id);

CREATE TABLE IF NOT EXISTS payment_attempts (
  id text PRIMARY KEY,
  intent_id text NOT NULL REFERENCES payment_intents(id),
  provider text NOT NULL,
  state text NOT NULL,
  external_id text,
  checkout_url text,
  provider_status text,
  route_score numeric,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, external_id)
);
CREATE INDEX IF NOT EXISTS payment_attempts_intent_idx ON payment_attempts(intent_id, created_at);

CREATE TABLE IF NOT EXISTS idempotency_records (
  scope text NOT NULL,
  key text NOT NULL,
  request_fingerprint char(64),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope, key)
);

CREATE TABLE IF NOT EXISTS webhook_receipts (
  provider text NOT NULL,
  event_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing','processed','failed')),
  kind text,
  intent_id text REFERENCES payment_intents(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  payload jsonb,
  PRIMARY KEY(provider, event_id)
);
CREATE INDEX IF NOT EXISTS webhook_failed_idx ON webhook_receipts(status, updated_at) WHERE status='failed';

CREATE TABLE IF NOT EXISTS refunds (
  id text PRIMARY KEY,
  intent_id text NOT NULL REFERENCES payment_intents(id),
  provider text NOT NULL,
  provider_refund_id text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_refund_id)
);

CREATE TABLE IF NOT EXISTS disputes (
  id text PRIMARY KEY,
  intent_id text REFERENCES payment_intents(id),
  provider text NOT NULL,
  provider_dispute_id text NOT NULL,
  amount_minor bigint,
  state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_dispute_id)
);

CREATE TABLE IF NOT EXISTS ledger_journals (
  id text PRIMARY KEY,
  journal_type text NOT NULL,
  reference text NOT NULL,
  currency char(3) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_lines (
  id bigserial PRIMARY KEY,
  journal_id text NOT NULL REFERENCES ledger_journals(id) ON DELETE RESTRICT,
  account text NOT NULL,
  side text NOT NULL CHECK (side IN ('debit','credit')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0)
);
CREATE INDEX IF NOT EXISTS ledger_lines_journal_idx ON ledger_lines(journal_id);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_unique_capture_reference_idx
  ON ledger_journals(reference) WHERE journal_type = 'payment_capture';

CREATE TABLE IF NOT EXISTS provider_health (
  provider text PRIMARY KEY,
  successes bigint NOT NULL DEFAULT 0,
  failures bigint NOT NULL DEFAULT 0,
  avg_latency_ms bigint NOT NULL DEFAULT 0,
  circuit_open_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_signals (
  id text PRIMARY KEY,
  intent_id text,
  sku text NOT NULL,
  email_hash text,
  ip_hash text,
  score integer NOT NULL,
  decision text NOT NULL,
  reasons jsonb NOT NULL,
  rules_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS risk_email_time_idx ON risk_signals(email_hash, created_at);
CREATE INDEX IF NOT EXISTS risk_ip_time_idx ON risk_signals(ip_hash, created_at);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id text PRIMARY KEY,
  reconciliation_type text NOT NULL,
  status text NOT NULL,
  checked_intents bigint,
  anomalies jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_checkpoints (
  id bigserial PRIMARY KEY,
  event_count bigint NOT NULL,
  last_hash char(64) NOT NULL,
  external_checkpoint_uri text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS paycore_kv (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

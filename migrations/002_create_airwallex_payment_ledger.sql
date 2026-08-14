CREATE TABLE IF NOT EXISTS airwallex_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  payment_intent_id TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL,
  payload_sha256 TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_airwallex_webhook_events_intent
  ON airwallex_webhook_events(payment_intent_id);

CREATE TABLE IF NOT EXISTS airwallex_payment_ledger (
  payment_intent_id TEXT PRIMARY KEY,
  merchant_order_id TEXT,
  amount NUMERIC(18, 2),
  currency VARCHAR(3),
  payment_status TEXT NOT NULL,
  last_event_name TEXT NOT NULL,
  last_event_at TIMESTAMPTZ NOT NULL,
  last_event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_airwallex_payment_ledger_order
  ON airwallex_payment_ledger(merchant_order_id);

CREATE INDEX IF NOT EXISTS idx_airwallex_payment_ledger_status
  ON airwallex_payment_ledger(payment_status);

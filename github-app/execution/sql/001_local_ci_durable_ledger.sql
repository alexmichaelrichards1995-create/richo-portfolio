CREATE SCHEMA IF NOT EXISTS execution_ci;

CREATE TABLE IF NOT EXISTS execution_ci.authorization_sessions (
  authorization_id text PRIMARY KEY,
  nonce_hash char(64) NOT NULL UNIQUE,
  source_sha char(40) NOT NULL,
  image_digest char(71) NOT NULL,
  provider text NOT NULL,
  region text NOT NULL,
  requested_spend_aud_cents bigint NOT NULL CHECK (requested_spend_aud_cents >= 0),
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'SUCCEEDED', 'FAILED')),
  receipt_count bigint NOT NULL DEFAULT 0 CHECK (receipt_count >= 0),
  last_receipt_hash char(64) NOT NULL DEFAULT repeat('0', 64),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS execution_ci.execution_receipts (
  authorization_id text NOT NULL REFERENCES execution_ci.authorization_sessions(authorization_id),
  sequence bigint NOT NULL CHECK (sequence > 0),
  action_id text NOT NULL,
  adapter text NOT NULL,
  state text NOT NULL CHECK (state IN ('SUCCEEDED', 'FAILED', 'COMPENSATED')),
  occurred_at timestamptz NOT NULL,
  source_sha char(40) NOT NULL,
  image_digest char(71) NOT NULL,
  nonce_hash char(64) NOT NULL,
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 240),
  execution_mode text NOT NULL CHECK (execution_mode = 'MOCK_ONLY'),
  prev_receipt_hash char(64) NOT NULL,
  receipt_hash char(64) NOT NULL UNIQUE,
  PRIMARY KEY (authorization_id, sequence)
);

CREATE OR REPLACE FUNCTION execution_ci.guard_session_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'execution authorization sessions are append-only records';
  END IF;

  IF NEW.authorization_id IS DISTINCT FROM OLD.authorization_id
     OR NEW.nonce_hash IS DISTINCT FROM OLD.nonce_hash
     OR NEW.source_sha IS DISTINCT FROM OLD.source_sha
     OR NEW.image_digest IS DISTINCT FROM OLD.image_digest
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.region IS DISTINCT FROM OLD.region
     OR NEW.requested_spend_aud_cents IS DISTINCT FROM OLD.requested_spend_aud_cents
     OR NEW.opened_at IS DISTINCT FROM OLD.opened_at THEN
    RAISE EXCEPTION 'execution authorization session identity is immutable';
  END IF;

  IF OLD.state <> NEW.state THEN
    IF OLD.state <> 'OPEN' OR NEW.state NOT IN ('SUCCEEDED', 'FAILED') OR NEW.closed_at IS NULL THEN
      RAISE EXCEPTION 'invalid execution session state transition';
    END IF;
  ELSIF OLD.closed_at IS DISTINCT FROM NEW.closed_at THEN
    RAISE EXCEPTION 'closed_at may change only when closing an OPEN session';
  END IF;

  IF NEW.receipt_count < OLD.receipt_count THEN
    RAISE EXCEPTION 'receipt_count cannot decrease';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS authorization_sessions_guard ON execution_ci.authorization_sessions;
CREATE TRIGGER authorization_sessions_guard
BEFORE UPDATE OR DELETE ON execution_ci.authorization_sessions
FOR EACH ROW EXECUTE FUNCTION execution_ci.guard_session_mutation();

CREATE OR REPLACE FUNCTION execution_ci.guard_receipt_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'execution receipts are immutable append-only records';
END;
$$;

DROP TRIGGER IF EXISTS execution_receipts_immutable ON execution_ci.execution_receipts;
CREATE TRIGGER execution_receipts_immutable
BEFORE UPDATE OR DELETE ON execution_ci.execution_receipts
FOR EACH ROW EXECUTE FUNCTION execution_ci.guard_receipt_mutation();

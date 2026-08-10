-- 003_create_payouts_table.sql
-- Record scheduled and executed payouts and a simple ledger for reconciliation

CREATE TABLE IF NOT EXISTS payouts (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL,
  gross_cents BIGINT NOT NULL,
  commission_cents BIGINT NOT NULL,
  net_cents BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, executed, failed
  scheduled_for DATE,
  executed_at TIMESTAMP WITH TIME ZONE NULL,
  stripe_transfer_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);

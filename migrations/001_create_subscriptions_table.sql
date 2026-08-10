-- 001_create_subscriptions_table.sql
-- Simple PostgreSQL migration to create subscriptions table for marketplace purchases

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL,
  account_login TEXT,
  plan_id INTEGER NOT NULL,
  plan_name TEXT,
  monthly_price_in_cents INTEGER,
  status TEXT DEFAULT 'active', -- active, scheduled_downgrade, cancelled
  billing_cycle_start DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (account_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_account_id ON subscriptions(account_id);

-- 002_create_verified_purchases_table.sql
-- Durable idempotency + analytics outbox for verified Stripe Checkout revenue.

CREATE TABLE IF NOT EXISTS verified_purchases (
  id BIGSERIAL PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  checkout_session_id TEXT NOT NULL UNIQUE,
  payment_intent_id TEXT,
  subscription_id TEXT,
  customer_id TEXT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency VARCHAR(3) NOT NULL CHECK (char_length(currency) = 3),
  product TEXT,
  posthog_distinct_id TEXT NOT NULL,
  attribution_quality TEXT NOT NULL,
  livemode BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL,
  analytics_event_uuid UUID NOT NULL,
  analytics_sent_at TIMESTAMP WITH TIME ZONE,
  analytics_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verified_purchases_paid_at
  ON verified_purchases(paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_verified_purchases_analytics_pending
  ON verified_purchases(analytics_sent_at)
  WHERE analytics_sent_at IS NULL;

CREATE TABLE IF NOT EXISTS shopify_webhook_receipts (
  id BIGSERIAL PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  topic TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  UNIQUE (shop_domain, webhook_id)
);

CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id BIGSERIAL PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  customer_gid TEXT NOT NULL,
  order_gid TEXT,
  action TEXT NOT NULL CHECK (action IN ('grant','revoke')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','leased','complete','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provisioning_jobs_ready_idx
  ON provisioning_jobs (status, available_at, lease_expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS provisioning_jobs_dedupe_idx
  ON provisioning_jobs (shop_domain, action, COALESCE(order_gid, ''), customer_gid)
  WHERE status <> 'dead';

CREATE TABLE IF NOT EXISTS customer_entitlement_events (
  id BIGSERIAL PRIMARY KEY,
  entitlement_id BIGINT,
  shop_domain TEXT NOT NULL,
  customer_gid TEXT NOT NULL,
  order_gid TEXT,
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_domain, event_key)
);

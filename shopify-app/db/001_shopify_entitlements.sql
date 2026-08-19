BEGIN;

CREATE TABLE IF NOT EXISTS shopify_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  topic TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  resource_id TEXT,
  payload_sha256 TEXT,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processing','processed','failed','ignored')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (shop_domain, webhook_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_webhook_events_status
  ON shopify_webhook_events (processing_status, received_at);

CREATE TABLE IF NOT EXISTS shopify_entitlements (
  id BIGSERIAL PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  customer_gid TEXT,
  customer_email TEXT,
  order_gid TEXT NOT NULL,
  line_item_gid TEXT,
  sku TEXT NOT NULL,
  family TEXT NOT NULL,
  tier TEXT NOT NULL,
  access_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','suspended','revoked','failed')),
  source_webhook_id TEXT,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shop_domain, order_gid, line_item_gid, access_key)
);

CREATE INDEX IF NOT EXISTS idx_shopify_entitlements_customer
  ON shopify_entitlements (shop_domain, customer_gid, status);

CREATE INDEX IF NOT EXISTS idx_shopify_entitlements_order
  ON shopify_entitlements (shop_domain, order_gid);

CREATE TABLE IF NOT EXISTS shopify_provisioning_jobs (
  id BIGSERIAL PRIMARY KEY,
  entitlement_id BIGINT NOT NULL REFERENCES shopify_entitlements(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','dead_letter')),
  idempotency_key TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_provisioning_jobs_queue
  ON shopify_provisioning_jobs (status, next_attempt_at, created_at);

COMMIT;

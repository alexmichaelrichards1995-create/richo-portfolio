BEGIN;

CREATE TABLE IF NOT EXISTS richo_entitlements (
  id text PRIMARY KEY,
  shop text NOT NULL,
  customer_id text NOT NULL,
  order_id text NOT NULL,
  sku text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('download','membership','service')),
  resource_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  expires_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shop, customer_id, order_id, sku, resource_key)
);

CREATE INDEX IF NOT EXISTS richo_entitlements_customer_idx
  ON richo_entitlements(shop, customer_id, status);
CREATE INDEX IF NOT EXISTS richo_entitlements_order_idx
  ON richo_entitlements(shop, order_id);

CREATE TABLE IF NOT EXISTS richo_download_audit (
  id bigserial PRIMARY KEY,
  shop text NOT NULL,
  entitlement_id text NOT NULL REFERENCES richo_entitlements(id),
  customer_id text NOT NULL,
  resource_key text NOT NULL,
  event text NOT NULL CHECK (event IN ('token_issued','download_started','download_completed','download_denied')),
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS richo_download_audit_entitlement_idx
  ON richo_download_audit(entitlement_id, created_at DESC);

COMMIT;

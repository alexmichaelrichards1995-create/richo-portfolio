CREATE TABLE IF NOT EXISTS richo_commerce_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text UNIQUE NOT NULL,
  release_candidate_id uuid,
  shopify_product_id text,
  shopify_variant_id text,
  title text NOT NULL,
  sku text,
  price_cents integer,
  currency text NOT NULL DEFAULT 'AUD',
  status text NOT NULL DEFAULT 'draft',
  digital_delivery jsonb NOT NULL DEFAULT '{}'::jsonb,
  membership_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_customer_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_key text NOT NULL,
  product_key text NOT NULL,
  source_type text NOT NULL,
  source_id text,
  status text NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  access jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(customer_key, product_key, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS richo_membership_projection (
  customer_key text NOT NULL,
  membership_key text NOT NULL,
  external_contract_id text,
  status text NOT NULL,
  tier text,
  renews_at timestamptz,
  expires_at timestamptz,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(customer_key, membership_key)
);

CREATE TABLE IF NOT EXISTS richo_commerce_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text NOT NULL,
  external_event_id text,
  correlation_id text,
  customer_key text,
  product_key text,
  amount_cents integer,
  currency text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS richo_entitlements_customer_idx ON richo_customer_entitlements(customer_key, status);
CREATE INDEX IF NOT EXISTS richo_commerce_events_customer_idx ON richo_commerce_events(customer_key, received_at DESC);

CREATE TABLE IF NOT EXISTS richo_shopify_experiments (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES richo_shopify_actions(id) ON DELETE RESTRICT,
  shop_domain TEXT NOT NULL,
  baseline JSONB NOT NULL,
  outcome JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  measured_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','measured','rolled_back','cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_richo_shopify_experiment_action
  ON richo_shopify_experiments(action_id);

CREATE INDEX IF NOT EXISTS idx_richo_shopify_experiment_shop_status
  ON richo_shopify_experiments(shop_domain, status, started_at DESC);

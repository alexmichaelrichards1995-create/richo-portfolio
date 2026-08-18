CREATE TABLE IF NOT EXISTS richo_shopify_actions (
  id TEXT PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  agent TEXT NOT NULL CHECK (agent IN ('conversion','catalog','revenue','customer','governance')),
  title TEXT NOT NULL,
  evidence TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('low','medium','high','critical')),
  reversible BOOLEAN NOT NULL DEFAULT false,
  requires_human_approval BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','executed','failed')),
  expected_state_hash TEXT,
  rollback_payload JSONB,
  mutation_payload JSONB,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_shopify_audit_events (
  id BIGSERIAL PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES richo_shopify_actions(id) ON DELETE RESTRICT,
  event TEXT NOT NULL CHECK (event IN ('PROPOSED','APPROVED','REJECTED','EXECUTED','FAILED','ROLLED_BACK')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system','human')),
  actor_id TEXT,
  evidence TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_richo_shopify_action_execution_once
  ON richo_shopify_audit_events(action_id, event)
  WHERE event = 'EXECUTED';

CREATE INDEX IF NOT EXISTS idx_richo_shopify_actions_shop_status
  ON richo_shopify_actions(shop_domain, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_richo_shopify_audit_action
  ON richo_shopify_audit_events(action_id, created_at ASC);

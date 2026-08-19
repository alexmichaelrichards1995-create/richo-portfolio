CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "scope" TEXT,
  "expires" TIMESTAMP(3),
  "accessToken" TEXT NOT NULL,
  "userId" BIGINT,
  "firstName" TEXT,
  "lastName" TEXT,
  "email" TEXT,
  "accountOwner" BOOLEAN NOT NULL DEFAULT false,
  "locale" TEXT,
  "collaborator" BOOLEAN DEFAULT false,
  "emailVerified" BOOLEAN DEFAULT false
);
CREATE INDEX IF NOT EXISTS "Session_shop_idx" ON "Session"("shop");

CREATE TABLE IF NOT EXISTS "richo_shopify_actions" (
  "id" TEXT PRIMARY KEY,
  "shop_domain" TEXT NOT NULL,
  "agent" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "evidence" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "risk" TEXT NOT NULL,
  "reversible" BOOLEAN NOT NULL DEFAULT false,
  "requires_human_approval" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'proposed',
  "expected_state_hash" TEXT,
  "rollback_payload" JSONB,
  "mutation_payload" JSONB,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "executed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "richo_shopify_actions_shop_domain_status_created_at_idx" ON "richo_shopify_actions"("shop_domain", "status", "created_at");

CREATE TABLE IF NOT EXISTS "richo_shopify_audit_events" (
  "id" BIGSERIAL PRIMARY KEY,
  "action_id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_id" TEXT,
  "evidence" TEXT,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "richo_shopify_audit_events_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "richo_shopify_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "richo_shopify_audit_events_action_id_created_at_idx" ON "richo_shopify_audit_events"("action_id", "created_at");

CREATE TABLE IF NOT EXISTS "richo_shopify_experiments" (
  "id" TEXT PRIMARY KEY,
  "action_id" TEXT NOT NULL UNIQUE,
  "shop_domain" TEXT NOT NULL,
  "target_product_id" TEXT,
  "baseline" JSONB NOT NULL,
  "outcome" JSONB,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "measured_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'running',
  CONSTRAINT "richo_shopify_experiments_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "richo_shopify_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "richo_shopify_experiments_shop_domain_status_started_at_idx" ON "richo_shopify_experiments"("shop_domain", "status", "started_at");
CREATE INDEX IF NOT EXISTS "richo_shopify_experiments_shop_domain_target_product_id_status_idx" ON "richo_shopify_experiments"("shop_domain", "target_product_id", "status");

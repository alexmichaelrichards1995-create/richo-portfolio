CREATE TABLE "richo_shop_controls" (
  "shop_domain" TEXT PRIMARY KEY,
  "deployment_state" TEXT NOT NULL DEFAULT 'BLOCKED',
  "deployment_approved" BOOLEAN NOT NULL DEFAULT FALSE,
  "sessions_revoked_at" TIMESTAMP(3),
  "last_scope_sync_at" TIMESTAMP(3),
  "last_webhook_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "richo_webhook_receipts" (
  "id" TEXT PRIMARY KEY,
  "shop_domain" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "webhook_id" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "richo_webhook_receipts_shop_domain_webhook_id_key"
  ON "richo_webhook_receipts"("shop_domain", "webhook_id");
CREATE INDEX "richo_webhook_receipts_shop_domain_processed_at_idx"
  ON "richo_webhook_receipts"("shop_domain", "processed_at");

CREATE TABLE "richo_security_events" (
  "id" BIGSERIAL PRIMARY KEY,
  "shop_domain" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "actor_id" TEXT,
  "target_id" TEXT,
  "correlation_id" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "richo_security_events_shop_domain_created_at_idx"
  ON "richo_security_events"("shop_domain", "created_at");

CREATE INDEX "richo_security_events_shop_domain_event_created_at_idx"
  ON "richo_security_events"("shop_domain", "event", "created_at");

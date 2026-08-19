CREATE TABLE "richo_shop_operators" (
  "id" TEXT NOT NULL,
  "shop_domain" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "can_approve" BOOLEAN NOT NULL DEFAULT false,
  "can_execute" BOOLEAN NOT NULL DEFAULT false,
  "can_rollback" BOOLEAN NOT NULL DEFAULT false,
  "can_administer" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "richo_shop_operators_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "richo_shop_operators_shop_domain_session_id_key" ON "richo_shop_operators"("shop_domain", "session_id");
CREATE INDEX "richo_shop_operators_shop_domain_active_idx" ON "richo_shop_operators"("shop_domain", "active");

CREATE TABLE "richo_mutation_windows" (
  "id" TEXT NOT NULL,
  "shop_domain" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "window_start" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "richo_mutation_windows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "richo_mutation_windows_shop_domain_actor_id_window_start_key" ON "richo_mutation_windows"("shop_domain", "actor_id", "window_start");
CREATE INDEX "richo_mutation_windows_shop_domain_window_start_idx" ON "richo_mutation_windows"("shop_domain", "window_start");

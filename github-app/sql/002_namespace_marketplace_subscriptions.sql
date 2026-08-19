BEGIN;

DO $$
BEGIN
  IF to_regclass('public.marketplace_subscriptions') IS NULL
     AND to_regclass('public.subscriptions') IS NOT NULL THEN
    ALTER TABLE public.subscriptions RENAME TO marketplace_subscriptions;
  END IF;
END
$$;

ALTER INDEX IF EXISTS public.idx_subscriptions_status
  RENAME TO idx_marketplace_subscriptions_status;

COMMIT;

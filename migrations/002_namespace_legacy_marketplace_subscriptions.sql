-- Namespace the older root Marketplace persistence scaffold so it cannot collide
-- with the canonical github-app Marketplace schema or Supabase customer billing.

ALTER TABLE IF EXISTS public.subscriptions RENAME TO legacy_marketplace_subscriptions;

ALTER INDEX IF EXISTS public.idx_subscriptions_account_id
  RENAME TO idx_legacy_marketplace_subscriptions_account_id;

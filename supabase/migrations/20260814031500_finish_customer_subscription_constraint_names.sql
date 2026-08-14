-- Finish namespace separation by renaming foreign-key constraints retained by
-- PostgreSQL when public.subscriptions became public.customer_subscriptions.

alter table public.customer_subscriptions
  rename constraint subscriptions_user_id_fkey
  to customer_subscriptions_user_id_fkey;

alter table public.customer_subscriptions
  rename constraint subscriptions_product_id_fkey
  to customer_subscriptions_product_id_fkey;

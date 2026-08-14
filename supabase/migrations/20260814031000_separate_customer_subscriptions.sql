-- Separate authenticated customer subscriptions from the legacy GitHub Marketplace
-- subscription table that exists on main. This is a forward-only compatibility
-- migration so the original verified commercial-core migration remains immutable.

alter table public.subscriptions rename to customer_subscriptions;

alter table public.customer_subscriptions
  rename constraint subscriptions_pkey to customer_subscriptions_pkey;

alter table public.customer_subscriptions
  rename constraint subscriptions_payment_provider_provider_subscription_id_key
  to customer_subscriptions_payment_provider_provider_subscription_id_key;

alter index public.subscriptions_user_status_idx
  rename to customer_subscriptions_user_status_idx;

alter trigger subscriptions_set_updated_at on public.customer_subscriptions
  rename to customer_subscriptions_set_updated_at;

alter policy subscriptions_select_own on public.customer_subscriptions
  rename to customer_subscriptions_select_own;

comment on table public.customer_subscriptions is
  'Authenticated customer subscription state synchronised from payment providers. Kept separate from legacy GitHub Marketplace subscriptions.';

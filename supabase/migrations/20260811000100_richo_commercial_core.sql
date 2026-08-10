-- R.I.C.H.O. Systems commercial core schema
-- Migration-only foundation. No live project is modified by this file alone.

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  company_name text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  timezone text not null default 'Australia/Brisbane',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists richo_on_auth_user_created on auth.users;
create trigger richo_on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  slug text not null unique,
  name text not null,
  description text,
  product_type text not null check (
    product_type in ('digital_download', 'software_access', 'subscription', 'service')
  ),
  delivery_mode text not null check (
    delivery_mode in ('download', 'account_access', 'subscription_access', 'service_delivery')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'active', 'archived')
  ),
  price_amount bigint not null check (price_amount >= 0),
  currency text not null default 'AUD' check (
    char_length(currency) = 3 and currency = upper(currency)
  ),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'paid', 'failed', 'cancelled', 'partially_refunded', 'refunded')
  ),
  currency text not null default 'AUD' check (
    char_length(currency) = 3 and currency = upper(currency)
  ),
  subtotal_amount bigint not null default 0 check (subtotal_amount >= 0),
  tax_amount bigint not null default 0 check (tax_amount >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  total_amount bigint not null default 0 check (total_amount >= 0),
  payment_provider text,
  provider_reference text,
  checkout_reference text,
  idempotency_key text unique,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index orders_provider_reference_unique
  on public.orders (payment_provider, provider_reference)
  where provider_reference is not null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku_snapshot text not null,
  name_snapshot text not null,
  unit_amount bigint not null check (unit_amount >= 0),
  quantity integer not null default 1 check (quantity > 0),
  line_total_amount bigint generated always as (unit_amount * quantity) stored,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  order_item_id uuid references public.order_items(id) on delete set null,
  entitlement_type text not null check (
    entitlement_type in ('download', 'software_access', 'subscription_access', 'service_access')
  ),
  status text not null default 'active' check (
    status in ('pending', 'active', 'revoked', 'expired')
  ),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  payment_provider text not null,
  provider_customer_id text,
  provider_subscription_id text not null,
  status text not null check (
    status in ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired')
  ),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_provider, provider_subscription_id),
  check (
    current_period_end is null
    or current_period_start is null
    or current_period_end > current_period_start
  )
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  correlation_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index products_publication_idx
  on public.products (status, published_at desc);
create index orders_user_created_idx
  on public.orders (user_id, created_at desc);
create index orders_status_idx
  on public.orders (status, created_at desc);
create index order_items_order_idx
  on public.order_items (order_id);
create index order_items_product_idx
  on public.order_items (product_id);
create index entitlements_user_status_idx
  on public.entitlements (user_id, status);
create index entitlements_product_idx
  on public.entitlements (product_id);
create index subscriptions_user_status_idx
  on public.subscriptions (user_id, status);
create index audit_events_actor_time_idx
  on public.audit_events (actor_user_id, occurred_at desc);
create index audit_events_entity_idx
  on public.audit_events (entity_type, entity_id, occurred_at desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();

create trigger orders_set_updated_at
before update on public.orders
for each row execute function private.set_updated_at();

create trigger entitlements_set_updated_at
before update on public.entitlements
for each row execute function private.set_updated_at();

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.entitlements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_events enable row level security;

revoke all privileges on table public.profiles from anon, authenticated;
revoke all privileges on table public.products from anon, authenticated;
revoke all privileges on table public.orders from anon, authenticated;
revoke all privileges on table public.order_items from anon, authenticated;
revoke all privileges on table public.entitlements from anon, authenticated;
revoke all privileges on table public.subscriptions from anon, authenticated;
revoke all privileges on table public.audit_events from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, company_name, country_code, timezone) on public.profiles to authenticated;
grant select on table public.products to anon, authenticated;
grant select on table public.orders to authenticated;
grant select on table public.order_items to authenticated;
grant select on table public.entitlements to authenticated;
grant select on table public.subscriptions to authenticated;

grant all privileges on table public.profiles to service_role;
grant all privileges on table public.products to service_role;
grant all privileges on table public.orders to service_role;
grant all privileges on table public.order_items to service_role;
grant all privileges on table public.entitlements to service_role;
grant all privileges on table public.subscriptions to service_role;
grant all privileges on table public.audit_events to service_role;
grant usage, select on sequence public.audit_events_id_seq to service_role;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy products_select_active_public
on public.products
for select
to anon, authenticated
using (
  status = 'active'
  and published_at is not null
  and published_at <= now()
);

create policy orders_select_own
on public.orders
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy order_items_select_own
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where public.orders.id = order_items.order_id
      and public.orders.user_id = (select auth.uid())
  )
);

create policy entitlements_select_own
on public.entitlements
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy subscriptions_select_own
on public.subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

comment on table public.profiles is 'Customer-owned profile metadata; authentication identity remains in auth.users.';
comment on table public.products is 'Server-managed digital R.I.C.H.O. commercial catalog.';
comment on table public.orders is 'Server-managed order headers. Client writes are intentionally not granted.';
comment on table public.order_items is 'Immutable-style order snapshots for purchased products.';
comment on table public.entitlements is 'Server-granted rights to downloads, software, subscriptions, or services.';
comment on table public.subscriptions is 'Server-synchronised subscription state from payment providers.';
comment on table public.audit_events is 'Internal security/commercial audit trail. No client read or write policy.';

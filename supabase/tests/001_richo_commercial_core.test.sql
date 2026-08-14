begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

-- Core relations exist.
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'products', 'products exists');
select has_table('public', 'orders', 'orders exists');
select has_table('public', 'order_items', 'order_items exists');
select has_table('public', 'entitlements', 'entitlements exists');
select has_table('public', 'customer_subscriptions', 'customer_subscriptions exists');
select hasnt_table('public', 'subscriptions', 'customer schema does not claim the legacy marketplace subscriptions table name');
select has_table('public', 'audit_events', 'audit_events exists');

-- RLS must remain enabled across every API-exposed commercial table.
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'profiles'),
  'profiles RLS enabled'
);
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'products'),
  'products RLS enabled'
);
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'orders'),
  'orders RLS enabled'
);
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'order_items'),
  'order_items RLS enabled'
);
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'entitlements'),
  'entitlements RLS enabled'
);
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'customer_subscriptions'),
  'customer_subscriptions RLS enabled'
);
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'audit_events'),
  'audit_events RLS enabled'
);

-- Policy sets are exact; accidental extra policies should fail the suite.
select policies_are(
  'public',
  'profiles',
  array['profiles_select_own', 'profiles_update_own'],
  'profiles policy set is exact'
);
select policies_are(
  'public',
  'products',
  array['products_select_active_public'],
  'products policy set is exact'
);
select policies_are(
  'public',
  'orders',
  array['orders_select_own'],
  'orders policy set is exact'
);
select policies_are(
  'public',
  'order_items',
  array['order_items_select_own'],
  'order_items policy set is exact'
);
select policies_are(
  'public',
  'entitlements',
  array['entitlements_select_own'],
  'entitlements policy set is exact'
);
select policies_are(
  'public',
  'customer_subscriptions',
  array['customer_subscriptions_select_own'],
  'customer_subscriptions policy set is exact'
);
select policies_are(
  'public',
  'audit_events',
  array[]::text[],
  'audit_events intentionally has no client policy'
);

-- Privilege boundaries: public catalog read, owner-only commercial reads,
-- service-role-controlled writes, and internal-only audit events.
select ok(has_table_privilege('anon', 'public.products', 'SELECT'), 'anon can select products');
select ok(not has_table_privilege('anon', 'public.orders', 'SELECT'), 'anon cannot select orders');
select ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'authenticated can select profiles subject to RLS');
select ok(has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'), 'authenticated can update display_name subject to RLS');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE'), 'authenticated cannot update profile created_at');
select ok(has_table_privilege('authenticated', 'public.orders', 'SELECT'), 'authenticated can select own orders subject to RLS');
select ok(not has_table_privilege('authenticated', 'public.orders', 'INSERT'), 'authenticated cannot insert orders');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'SELECT'), 'authenticated cannot read audit events');
select ok(has_table_privilege('authenticated', 'public.entitlements', 'SELECT'), 'authenticated can select own entitlements subject to RLS');
select ok(has_table_privilege('service_role', 'public.audit_events', 'INSERT'), 'service_role can insert audit events');

select * from finish();
rollback;
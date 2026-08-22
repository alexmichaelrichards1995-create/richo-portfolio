begin;

select plan(10);

select is(
  (select count(*)::integer from public.products where sku = 'RICHO-PILOT-199'),
  1,
  'canonical Pilot seed exists exactly once'
);

select is(
  (select price_amount from public.products where sku = 'RICHO-PILOT-199'),
  19900::bigint,
  'Pilot seed price is A$199 in minor units'
);

select is(
  (select currency from public.products where sku = 'RICHO-PILOT-199'),
  'AUD',
  'Pilot seed currency is AUD'
);

select is(
  (select product_type from public.products where sku = 'RICHO-PILOT-199'),
  'service',
  'Pilot is modelled as a service'
);

select is(
  (select delivery_mode from public.products where sku = 'RICHO-PILOT-199'),
  'service_delivery',
  'Pilot uses service delivery rather than download classification'
);

select is(
  (select status from public.products where sku = 'RICHO-PILOT-199'),
  'active',
  'Pilot seed is active'
);

select is(
  (select metadata ->> 'storage_bucket' from public.products where sku = 'RICHO-PILOT-199'),
  'richo-digital-deliveries',
  'Pilot references the controlled digital delivery bucket'
);

select is(
  (select metadata ->> 'delivery_asset_kind' from public.products where sku = 'RICHO-PILOT-199'),
  'onboarding',
  'Pilot private asset is explicitly onboarding material'
);

select is(
  (select public from storage.buckets where id = 'richo-digital-deliveries'),
  false,
  'digital delivery bucket is private'
);

select is(
  (select count(*)::integer
   from storage.objects
   where bucket_id = 'richo-digital-deliveries'
     and name = 'richo-pilot-199/RICHO_AI_Operations_Pilot_Onboarding.md'),
  1,
  'Pilot onboarding object is seeded exactly once'
);

select * from finish();
rollback;

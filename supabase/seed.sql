-- R.I.C.H.O. Systems canonical commercial seed data.
-- Data only: schema belongs in migrations.

insert into public.products (
  sku,
  slug,
  name,
  description,
  product_type,
  delivery_mode,
  status,
  price_amount,
  currency,
  metadata,
  published_at
)
values (
  'RICHO-PILOT-199',
  'r-i-c-h-o-ai-operations-pilot-workflow-assessment-onboarding',
  'R.I.C.H.O. AI Operations Pilot — Workflow Assessment & Action Plan',
  'A focused, human-reviewed assessment of one business workflow with workflow mapping, AI opportunity analysis, controls, QA requirements and a prioritised implementation roadmap.',
  'service',
  'service_delivery',
  'active',
  19900,
  'AUD',
  jsonb_build_object(
    'source_system', 'shopify',
    'shopify_product_gid', 'gid://shopify/Product/8307974307903',
    'shopify_variant_gid', 'gid://shopify/ProductVariant/43752529592383',
    'shopify_handle', 'r-i-c-h-o-ai-operations-pilot-workflow-assessment-onboarding',
    'offering_scope', 'one_focused_workflow',
    'human_review_required', true,
    'storage_bucket', 'richo-digital-deliveries',
    'storage_path', 'richo-pilot-199/RICHO_AI_Operations_Pilot_Onboarding.md',
    'delivery_asset_kind', 'onboarding',
    'source_verified_at', '2026-08-19T10:53:00+10:00'
  ),
  now()
)
on conflict (sku) do update
set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  product_type = excluded.product_type,
  delivery_mode = excluded.delivery_mode,
  status = excluded.status,
  price_amount = excluded.price_amount,
  currency = excluded.currency,
  metadata = excluded.metadata,
  published_at = coalesce(public.products.published_at, excluded.published_at),
  updated_at = now();

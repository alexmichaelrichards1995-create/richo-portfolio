-- Durable payment-provider event ledger. This table is deliberately inaccessible
-- to browser roles; backend billing workers use a Supabase secret/service role.

create table public.payment_events (
  id text primary key,
  provider text not null check (provider in ('stripe')),
  event_type text not null,
  status text not null default 'processing' check (
    status in ('processing', 'processed', 'failed', 'ignored')
  ),
  entity_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index payment_events_status_received_idx
  on public.payment_events (status, received_at desc);

alter table public.payment_events enable row level security;

revoke all on table public.payment_events from anon, authenticated;
grant select, insert, update, delete on table public.payment_events to service_role;

comment on table public.payment_events is
  'Server-only idempotency and processing ledger for signed payment-provider webhooks.';

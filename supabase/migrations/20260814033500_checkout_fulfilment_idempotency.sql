-- Harden Stripe Checkout fulfilment against duplicate/retried webhook delivery.
-- A Checkout Session maps to one order, and each order item can grant at most
-- one entitlement. PostgreSQL UNIQUE constraints permit multiple NULL values,
-- so draft/manual rows without these references remain valid.

alter table public.orders
  add constraint orders_checkout_reference_unique unique (checkout_reference);

alter table public.entitlements
  add constraint entitlements_order_item_unique unique (order_item_id);

# R.I.C.H.O. Shopify Operations App

Production-oriented Shopify app module for the R.I.C.H.O. Systems digital catalogue.

## Purpose

This app is the operational layer behind the storefront. It is designed to:

- read and classify the live R.I.C.H.O. Shopify catalogue;
- map paid products and memberships to customer entitlements;
- receive Shopify webhooks and create idempotent fulfilment/provisioning events;
- expose an embedded Shopify Admin dashboard for catalogue health, purchases, memberships and fulfilment state;
- preserve human approval for high-impact actions;
- maintain an auditable event trail for provisioning and support.

## Current build slice

The first slice adds:

1. `richo-catalog.server.ts` — canonical SKU/plan classification and entitlement rules.
2. `app._index.tsx` — embedded admin dashboard loader and UI using Shopify Admin GraphQL.
3. `webhooks.orders.paid.tsx` — paid-order ingestion and deterministic entitlement planning.

The code is intentionally isolated under `shopify-app/` so it does not overwrite the existing Richo portfolio runtime.

## Intended runtime

Use Shopify's current React Router app template as the host runtime. The module assumes the standard template exports `authenticate` from `app/shopify.server.ts`.

Expected environment variables are those created by Shopify CLI / app deployment, including `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL` and `SCOPES`.

## Required scopes

Start with the minimum needed for the implemented slice:

- `read_products`
- `read_orders`
- `read_customers`

Add write scopes only when a feature genuinely requires them.

## Safety and operational controls

- No secrets are committed.
- Webhook work should be idempotent using Shopify webhook/event identifiers plus order/line-item identity.
- Entitlements are planned first; irreversible fulfilment or external provisioning should be executed by a separate service after validation.
- Human approval remains required for destructive or high-impact merchant actions.
- Do not grant an entitlement from client-supplied SKU data; derive it from authenticated Shopify order payloads / Admin API data.

## Next implementation stages

1. Persist webhook event and entitlement state in Prisma/Postgres.
2. Add `app.entitlements.tsx` for customer access management.
3. Add download-token generation for digital products.
4. Add membership lifecycle sync for Starter / Pro / Operator.
5. Add failed-provisioning retry queue and dead-letter state.
6. Add audit log, health checks and operational metrics.
7. Add tests for replayed webhooks, unknown SKUs, refunds/cancellations and partial orders.
8. Add deployment configuration and CI specific to this module.

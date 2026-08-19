# R.I.C.H.O. Commerce + Marketplace Integration Boundary

## Status

This document describes the isolated integration branch. It is not production deployment, database migration, payment, payout, or merge authorisation.

## Three distinct commercial domains

### 1. Customer commerce — canonical web store

Runtime: repository root Next.js application.

Persistence: Supabase customer-commerce project.

Canonical subscription table: `public.customer_subscriptions`.

Payment provider boundary: customer Stripe Checkout/Webhooks using `STRIPE_RESTRICTED_KEY` and `STRIPE_WEBHOOK_SECRET`.

Authority: orders, payment reconciliation, entitlements, customer subscriptions, private digital/service delivery and customer billing portal.

Live-money gate: `STRIPE_MODE=live` plus `RICHO_LIVE_PAYMENTS_ENABLED=true` are both required. Default is test/disabled.

### 2. Canonical GitHub Marketplace — GitHub App service

Runtime: `github-app/`.

Persistence: dedicated service-local PostgreSQL database configured through `github-app/.env.example` / service `DATABASE_URL`.

Canonical subscription table: `marketplace_subscriptions`.

Authority: GitHub App installations, Marketplace purchase state, webhook delivery ledger, jobs and GitHub App audit records.

This database must not be the Supabase customer-commerce database and must not be the legacy compatibility database.

### 3. Legacy GitHub Marketplace compatibility lane

Runtime: root compatibility modules such as `marketplace_webhook_handler.js`, `subscriptions_service.js` and `db/db_client.js`.

Persistence: dedicated `LEGACY_MARKETPLACE_DATABASE_URL` only.

Canonical compatibility table: `legacy_marketplace_subscriptions`.

Purpose: preserve and test older integration behavior while the canonical GitHub App service becomes the sole Marketplace implementation.

File fallback is restricted to explicit test/development use. It is not a production persistence strategy.

Legacy Stripe Connect is isolated from customer Stripe with `STRIPE_CONNECT_SECRET_KEY`. Account creation requires `RICHO_MARKETPLACE_CONNECT_ENABLED=true`; transfers additionally require `RICHO_LIVE_PAYOUTS_ENABLED=true`. Both gates default off.

## Main-branch reconciliation decisions

The integration branch deliberately resolves current `main` choices rather than blindly copying them:

- Root `package.json`: keep Next.js 16.2.12, React 19.2.8, Stripe 22.5.0 and Node 22; add same-major Express 4 / pg 8 compatibility dependencies instead of reverting to the older legacy package.
- Generic root `subscriptions`: rejected. Customer, canonical Marketplace and legacy compatibility keep separate table names.
- Generic legacy `DATABASE_URL`: rejected. Legacy compatibility requires `LEGACY_MARKETPLACE_DATABASE_URL`.
- Legacy Stripe `STRIPE_API_KEY`: rejected. Compatibility Connect uses `STRIPE_CONNECT_SECRET_KEY` and separate default-off Connect/payout gates.
- Main `.github/workflows/ci.yml`: superseded on this integration line by `.github/workflows/integration-reconciliation-ci.yml`, which tests all three commercial domains separately on Node 22 and separate database services.
- The hardened webhook behavior is retained: no known fallback secret and no HTTP success before processing/idempotency persistence finishes.
- The stronger `github-app/` implementation is the canonical Marketplace direction; the root Marketplace scaffold is compatibility-only.

These are merge-resolution decisions on the integration branch, not production activation decisions.

## Invariants

1. `customer_subscriptions`, `marketplace_subscriptions`, and `legacy_marketplace_subscriptions` are different domain models and must never be aliased or automatically synchronized by table-name tricks.
2. No generic production database credential is shared among the three domains.
3. Customer Stripe credentials are not reused for legacy Marketplace Connect.
4. Browser redirects never prove payment, subscription or entitlement state.
5. Signed provider webhooks and durable persistence are authoritative for commercial state.
6. No live payment, payout, deployment or remote schema change is permitted by this integration branch alone.
7. Human/owner approval remains required before merge, live schema application, production credentials, public deployment or money movement.

## Integration order

1. Prove root dependency compatibility on Node 22.
2. Run the cross-domain boundary contract.
3. Verify customer-commerce security/type/build gates.
4. Rebuild and test the local Supabase schema, seed and private delivery bucket.
5. Execute the controlled Pilot purchase with Stripe mock and local Supabase only.
6. Test canonical `github-app` against a dedicated Postgres instance.
7. Test legacy compatibility against a different dedicated Postgres instance with production credentials absent.
8. Record a reconciliation commit against current `main`.
9. Open a draft integration PR for review.
10. Merge/deploy only after explicit owner approval and green evidence from all applicable gates.

## Retirement direction

The root legacy Marketplace compatibility lane is transitional. New Marketplace capability belongs in `github-app/`. Once migration evidence proves all required behavior exists in the canonical service, the compatibility lane can be removed through a separately reviewed change rather than silently maintained forever.

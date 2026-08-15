# R.I.C.H.O. PayCore Intake — v2.2.1 Source Recovery

This service restores the authoritative Stripe payment-intake path from auditable source after the later generated bootstrap deployment failed before the normal Next.js build completed.

## Authority boundary

PayCore is authoritative for payment state. Checkout redirects and analytics are not payment truth. PostHog remains downstream analytics only. This service does not grant autonomous refund, payout, transfer, dispute, banking, tax or fulfilment authority.

## Runtime routes

- `GET /api/health` — fail-closed configuration, database-schema and Stripe-account readiness.
- `POST /api/checkout/[sku]` — server-owned product/price Checkout creation.
- `POST /api/stripe/webhook` — exact raw-body Stripe signature verification, durable provider-event claim, canonical commercial validation and idempotent state transition.

## Database transports

Production Neon URLs use `@neondatabase/serverless`. Localhost recovery/CI URLs use the standard `pg` driver through the same tagged-query contract. The local adapter exists to prove the real built Next.js service against ordinary PostgreSQL 16; it does not alter the deployed Neon authority model.

Recovery CI must prove both schema compatibility and real HTTP execution:

1. start a fresh PostgreSQL 16 database;
2. apply `sql/001_paycore_schema.sql` twice;
3. pass source/security tests and TypeScript;
4. complete a real Next.js production build;
5. start the built server;
6. reject an unsigned webhook;
7. accept a correctly HMAC-signed Stripe-style event;
8. persist exactly one durable receipt;
9. replay the same event and prove duplicate suppression;
10. reject any reintroduction of `bootstrap.mjs`.

The signed fixture is an expired Checkout event with no intent metadata, so the expected invariant is exactly one processed webhook receipt and zero fabricated payment intents.

## Required secure runtime configuration

Never commit real values. The runtime stays `activation_required` unless the required configuration exists:

- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PAYCORE_PII_ENCRYPTION_KEY`
- `EMAIL_HASH_PEPPER`
- `NEXT_PUBLIC_SITE_URL`
- optional `STRIPE_EXPECTED_ACCOUNT_ID`
- optional `CHECKOUT_ALLOWED_ORIGINS`

Test mode must be activated before any live-mode consideration. Keep the Stripe account pin enabled when a stable account ID is known.

## Replacement gate

Do not replace the currently serving fallback merely because the project builds. Promotion requires a controlled deployed environment with secure test credentials, schema-ready database, healthy Checkout/webhook readiness, one successful Stripe test Checkout, one durable verified success, explicit duplicate-event proof, and downstream analytics emitted only after PayCore success.

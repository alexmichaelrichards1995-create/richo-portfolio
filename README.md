# R.I.C.H.O. Product Runtime

R.I.C.H.O. (Research Intelligence & Continuous Heuristic Optimisation) product runtime and governed commercial instrumentation.

## Commercial analytics boundary

Browser analytics records page views, engagement and checkout-start intent. A checkout-start event is **not** treated as a sale.

Verified revenue is emitted only from a Stripe-signed Checkout success event after the session is confirmed paid with a positive amount and valid currency. The verified purchase is persisted in PostgreSQL before the server-side `richo_purchase_completed` event is sent to PostHog.

### Revenue API

The Vercel serverless entrypoint is `api/index.js`.

- `GET /api/health` — liveness plus non-secret configuration flags.
- `GET /api/ready` — readiness gate; requires database, Stripe webhook secret and PostHog project token, and verifies the database is reachable.
- `POST /api/stripe` — signed Stripe Checkout webhook. The Stripe router is mounted before any JSON/body parser so `express.raw()` receives the exact request bytes required for signature verification.

Production activation requires Vercel environment variables:

- `DATABASE_URL`
- `STRIPE_WEBHOOK_SECRET`
- `POSTHOG_PROJECT_TOKEN`
- optional `POSTHOG_HOST` (defaults to the US PostHog ingestion host)
- `STRIPE_API_KEY` only for code paths that call Stripe APIs; webhook signature verification itself uses the webhook signing secret.

Never commit these values to the repository.

### Stripe events accepted as verified revenue

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

An event is ignored unless `payment_status=paid`, `amount_total` is a positive safe integer, and `currency` is a valid three-letter code.

### Idempotency and recovery

The `verified_purchases` ledger is keyed by Checkout Session ID. Duplicate webhook deliveries do not create duplicate sales. PostHog delivery status is persisted separately so temporary analytics failures can be retried without losing or double-counting the verified purchase.

## Validation

CI applies all SQL migrations and tests:

- migration schema expectations
- marketplace webhook behavior and idempotency
- webhook signature verification
- paid/unpaid/zero-value Stripe revenue qualification
- duplicate webhook suppression
- analytics retry recovery
- delayed-payment success handling
- Vercel revenue API health/routing contract

Production is not considered activated until a deployed `/api/ready` returns `ready`, Stripe has a webhook endpoint registered to the public `/api/stripe` route, and a signed test event is accepted and persisted.

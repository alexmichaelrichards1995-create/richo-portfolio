# R.I.C.H.O. Product Runtime Hub

![CI](https://github.com/alexmichaelrichards1995-create/richo-portfolio/actions/workflows/ci.yml/badge.svg)

A controlled browser-based runtime layer for the R.I.C.H.O. (Research Intelligence & Continuous Heuristic Optimisation) digital product catalogue.

## Current runtime

- 53 addressable products: `RSP-001` through `RSP-053`
- 6 product-family readiness engines
- 3 specialised interactive engines for:
  - RSP-001 — AI Governance Starter Kit
  - RSP-002 — Paid Pilot Readiness Kit
  - RSP-003 — Buyer-Ready IP and Due-Diligence Kit
- deterministic client-side scoring
- evidence-gap reporting
- explicit human approval gates
- privacy-restricted PostHog page, CTA, readiness and checkout-start instrumentation
- signed Stripe Checkout revenue webhook with paid-only verification
- PostgreSQL verified-purchase ledger and retry-safe analytics outbox
- automated smoke, migration, webhook-signature and idempotency tests

## Verified revenue boundary

`richo_checkout_started` is an intent signal only. It is never treated as a sale.

A `richo_purchase_completed` event is eligible only after the backend receives a valid Stripe-signed Checkout webhook for `checkout.session.completed` or `checkout.session.async_payment_succeeded`, the Checkout Session reports `payment_status=paid`, and `amount_total` is positive. The verified purchase is persisted by Checkout Session ID before analytics delivery.

The server-side analytics event sends revenue in Stripe minor units and an ISO 4217 currency code. PostHog delivery has durable retry state, while a stable event UUID provides an additional analytics deduplication boundary.

The revenue webhook requires production runtime configuration for `DATABASE_URL`, `STRIPE_WEBHOOK_SECRET`, `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`, and the appropriate Stripe API key. Secrets must remain server-side.

## Product families

1. Foundation
2. Governance, Risk & Assurance
3. Commercial & Revenue
4. Product & Delivery
5. Procurement, Market Access & Transactions
6. Leadership, Workforce & Operating System

## Safety and authority boundary

The runtime is an implementation/readiness aid. A readiness score does not provide professional advice, certification, legal compliance, financial approval, security assurance, contractual acceptance or authority to perform consequential external actions. Human approval remains required where applicable.

Verified revenue telemetry records evidence of cleared Stripe Checkout revenue; it does not itself perform fulfillment, alter pricing, issue refunds, move funds, or authorize external actions.

## Local verification

```bash
node tests/smoke.mjs
npm test
```

CI applies all database migrations and checks the runtime, analytics privacy controls, verified purchase ledger, signed Stripe event parsing, paid-only revenue rules, retry recovery and duplicate-event behavior.

## Local preview

### Docker

```bash
docker build -t richo-runtime .
docker run --rm -p 8080:80 richo-runtime
```

Open `http://localhost:8080`.

You can also serve the repository root with any static HTTP server.

## Deployment targets

Configuration is retained for GitHub Pages, Vercel, Netlify and Docker/Nginx.

The GitHub Actions workflow runs the smoke gate, packages the static site and attempts a Pages deployment from `main`. GitHub Pages must be enabled in repository settings before the final Pages deployment step can succeed.

The verified Stripe revenue webhook is a backend router and must be mounted on a server/runtime that preserves the raw request body before JSON parsing. The static GitHub Pages surface alone cannot receive Stripe webhooks.

## Production domain

Primary Richo Systems domain: `https://richosystems.technology/`

The runtime also links to the Richo Systems tools surface at `/tools`.

## Repository structure

- `index.html` — runtime UI and product surfaces
- `catalog.js` — canonical RSP-001–RSP-053 runtime catalogue
- `app.js` — scoring, search, selection and readiness engines
- `analytics.js` — privacy-restricted browser telemetry
- `stripe_payment_webhook.js` — signed paid-only Stripe revenue processing
- `verified_purchase_store.js` — PostgreSQL idempotency ledger and analytics outbox
- `posthog_server.js` — server-side PostHog ingestion client
- `migrations/002_create_verified_purchases_table.sql` — revenue ledger schema
- `styles.css` — responsive runtime interface
- `tests/smoke.mjs` — pre-deployment runtime/analytics verification
- `tests/stripe_payment_webhook.test.js` — revenue signature/idempotency/retry tests
- `.github/workflows/ci.yml` — protected CI gate
- `.github/workflows/deploy-pages.yml` — static site deployment workflow
- `Dockerfile`, `vercel.json`, `netlify.toml` — alternate deployment targets

## Completion standard

A product should not be described as fully production-ready merely because it appears in the catalogue. The shared runtime currently gives all 53 products an executable readiness/control layer. Full product-specific software conversion requires each product to receive its own workflow logic, input/output model, persistence/export requirements where appropriate, acceptance tests, documentation and deployment verification.

Likewise, verified purchase code and passing tests do not prove live revenue. Live sales require a deployed webhook endpoint, Stripe endpoint registration, valid production secrets, successful signed-event delivery, and a persisted paid purchase receipt.

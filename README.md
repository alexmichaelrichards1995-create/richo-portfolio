# R.I.C.H.O. Portfolio / Commercial Systems

This repository contains the public R.I.C.H.O. portfolio plus supporting commercial-system scaffolds.

## Airwallex PayCore sandbox integration

The Airwallex integration is intentionally sandbox-first and keeps credentials server-side.

### Environment

```bash
AIRWALLEX_ENV=sandbox
AIRWALLEX_CLIENT_ID=...
AIRWALLEX_API_KEY=...
AIRWALLEX_WEBHOOK_SECRET=...
```

Production API access remains blocked unless the deployment is deliberately configured with:

```bash
AIRWALLEX_ALLOW_PRODUCTION=true
```

Do not commit Airwallex credentials or webhook secrets.

### Payment flow

1. R.I.C.H.O. resolves the trusted internal order and price server-side.
2. `airwallex_checkout_service.js` creates a PaymentIntent through `airwallex_integration.js`.
3. The shopper completes payment through an Airwallex-hosted or embedded checkout surface.
4. `airwallex_webhook_handler.js` verifies the raw webhook body with HMAC-SHA256 before parsing it.
5. `airwallex_payment_store.js` applies the event idempotently and prevents older events from overwriting newer state.
6. The payment ledger stores reconciliation fields and a payload hash rather than the full customer-bearing webhook payload.

Mount the webhook router in an Express API service at an HTTPS endpoint. The router exposes:

```text
POST /airwallex
```

Subscribe the endpoint to PaymentIntent lifecycle events in Airwallex. A successful `payment_intent.succeeded` webhook is the authoritative fulfillment signal; do not rely only on browser redirects.

### Validation

Run:

```bash
npm test
```

The test suite covers the existing database/marketplace/Stripe scaffolds plus Airwallex client behavior, trusted-order pricing, webhook signature verification, replay protection, duplicate event handling, and out-of-order payment events.

## Safety boundary

The repository is development scaffolding. Production activation requires provider onboarding, production credentials, a deployed HTTPS API endpoint, webhook configuration, sandbox end-to-end payment tests, monitoring, and explicit owner approval.

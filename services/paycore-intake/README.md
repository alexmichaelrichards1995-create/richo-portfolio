# R.I.C.H.O. PayCore Payment Intake v2.2.1

This directory is the auditable source-controlled recovery of the R.I.C.H.O. Stripe payment intake service.

## Why this recovery exists

The active Vercel project has a known-good v2.0.0 production deployment. A later v2.2.0 deployment failed before `next build` because its package ran a generated, compressed `bootstrap.mjs` step. The original v2.2 source package was not preserved. This recovery deliberately does not reproduce that opaque build mechanism.

## Authority boundary

PayCore is the payment system of record. Browser analytics and PostHog are never payment authority.

A successful sale requires all of these gates:

1. server-owned SKU, price and currency;
2. Stripe-hosted Checkout session created from that canonical state;
3. exact raw Stripe webhook signature verification;
4. durable event claim in `webhook_receipts`;
5. canonical order/SKU/amount/currency validation;
6. succeeded Stripe payment state;
7. atomic PayCore promotion to `succeeded`;
8. durable payment-attempt evidence;
9. fulfilment only staged after verified success.

## Required environment

See `.env.example`. Real secret values must remain in Vercel environment variables or another approved secret manager; never commit them.

## Commands

```bash
npm install
npm test
npm run typecheck
npm run build
```

The build script intentionally runs tests and typecheck before `next build`. CI also asserts that `bootstrap.mjs` is absent and not referenced by the build command.

## Deployment gate

This recovered service must not replace the currently serving production deployment until:

- CI passes on the exact commit;
- a Vercel preview build reaches READY;
- test-mode `DATABASE_URL`, Stripe restricted/test API key and endpoint-specific webhook secret are configured;
- `/api/health` reports ready in test mode;
- one controlled test checkout produces exactly one durable webhook receipt and payment success;
- duplicate Stripe delivery is acknowledged without a second sale;
- the verified PayCore success is sent once to revenue analytics.

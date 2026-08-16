# R.I.C.H.O. PayCore deployment hardening

## Production authority

The existing `richo-paycore-intake-api` service remains the authoritative payment receiver until a controlled replacement is explicitly approved and activated. Do not run two independent Stripe receivers or payment ledgers for the same checkout flow.

## August 9, 2026 failed deployment

Vercel deployment `dpl_CkyyqfWsPTTAGJLhAWyuTB1F99QT` failed during `npm run build` with `BUILD_UTILS_SPAWN_1`. The attempted package identified itself as `richo-stripe-payment-event-intake@2.2.0` and executed a generated `bootstrap.mjs` before `next build`. The failure occurred inside that bootstrap artifact. Vercel correctly retained the prior READY production deployment (`dpl_G2KhrtPioYFr4GEGqJCJX63rKvbm`, service v2.0.0) behind the production alias.

The failed deployment was an opaque two-file upload rather than a source-controlled build. Future payment-service deployments should be reproducible from reviewed source and must not depend on a generated compressed bootstrap blob as the only application source.

## Source-controlled replacement contract

The repository now contains an explicit Vercel serverless entrypoint and routing contract. Runtime readiness is fail-closed and requires:

- `DATABASE_URL`
- `STRIPE_WEBHOOK_SECRET`
- `POSTHOG_PROJECT_TOKEN`
- `REVENUE_SYNC_TOKEN`
- a reachable PostgreSQL database containing `public.payment_intents`
- a reachable PostgreSQL database containing `public.paycore_kv`

Run `npm run activation:preflight` in the target runtime before activation. The preflight reports configuration/readiness metadata only and never prints secret values.

## Activation sequence

1. Keep Stripe in test mode.
2. Install production-environment variables through Vercel's encrypted environment-variable store.
3. Run the activation preflight and require a zero exit code.
4. Require `/api/ready` to return ready with a compatible PayCore schema.
5. Confirm the single Stripe test webhook points to the authoritative PayCore receiver.
6. Deliver one signed test Checkout event.
7. Verify exactly one durable webhook receipt and one PayCore success transition.
8. Redeliver the same event and verify idempotency.
9. Run the revenue bridge and verify exactly one PostHog `richo_purchase_completed` event/checkpoint.
10. Do not enable live Stripe mode until the owner explicitly approves production activation.

# R.I.C.H.O. PayCore Next deployment

This directory is the secret-free, source-controlled representation of the canonical PayCore v3 deployment currently served from `richo-paycore-intake-api.vercel.app`.

## Payment truth

PayCore remains the only payment truth:

`approved offer → PayCore intent/attempt → Stripe Payment Link → signed Stripe webhook → durable PayCore success → live-only analytics`

The browser submits an approved offer slug only. It never supplies authoritative price, currency, tax or payment state.

## Required encrypted runtime configuration

Configure these in the deployment platform; never commit their values:

- `DATABASE_URL`
- `STRIPE_WEBHOOK_SECRET`
- `PAYMENT_MODE` — exactly `sandbox` or `live`
- `AU_GST_REGISTERED` — exactly `true` or `false`
- `PAYMENT_LINK_RSP056_URL`
- `PAYMENT_LINK_RSP056_ID`
- `PAYMENT_LINK_COURSE_URL`
- `PAYMENT_LINK_COURSE_ID`
- `PAYMENT_LINK_SESSION_URL`
- `PAYMENT_LINK_SESSION_ID`
- `POSTHOG_PROJECT_TOKEN` — required when `PAYMENT_MODE=live`
- `POSTHOG_HOST` — optional; defaults to the configured US ingestion host

## Fail-closed mode boundary

Sandbox and live mode are intentionally incompatible:

- sandbox requires Stripe `/test_` Payment Links;
- live rejects Stripe `/test_` Payment Links;
- webhook `event.livemode` must exactly equal the configured payment mode;
- the stored PayCore intent `livemode` must also match;
- sandbox successes are never emitted as real revenue;
- live-mode readiness requires a PostHog project token for verified revenue telemetry.

## Exact approved offer amounts

- `RSP-056` — R.I.C.H.O. AI Business Quick-Wins Kit — A$19 AUD
- `RICHO-AQF-COURSE` — AI Quick Fix for Small Business — A$49 AUD
- `RICHO-AQF-SESSION` — AI Quick Fix Session — A$197 AUD

## Production gate

Before changing `PAYMENT_MODE` to `live`:

1. Install encrypted production values in Vercel.
2. Use live Stripe Payment Links for the same approved AUD amounts.
3. Install the signing secret for the live Stripe webhook pointing to the canonical `/api/stripe/webhook` route.
4. Confirm `/api/ready` is 200 and reports `paymentMode: live` and `liveMoney: true`.
5. Confirm the webhook list has one intended live receiver for the flow.
6. Run one owner-authorized low-risk live transaction and prove exactly one PayCore intent, one processed receipt and one live analytics checkpoint.
7. Rotate any temporary sandbox credentials that were used outside encrypted Vercel environment storage.

Do not treat a Stripe success redirect, browser event or sandbox payment as revenue evidence.

# R.I.C.H.O. PayCore Next deployment

This directory is the secret-free, source-controlled representation of the canonical PayCore v3 deployment currently served from `richo-paycore-intake-api.vercel.app`.

## Payment truth

PayCore remains the only payment truth:

`approved offer → PayCore intent/attempt → Stripe Payment Link → signed Stripe webhook → durable PayCore success → live-only revenue analytics`

The browser submits an approved offer slug only. It never supplies authoritative price, currency, tax or payment state.

## Required deployment configuration

Configure these in the deployment platform; never commit secret values:

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
- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` — required for privacy-safe browser pageview/engagement telemetry; this is a public project token, not a private API credential
- `NEXT_PUBLIC_POSTHOG_HOST` — optional; defaults to `https://us.i.posthog.com`
- `POSTHOG_PROJECT_TOKEN` — required when `PAYMENT_MODE=live` for verified server-side revenue telemetry
- `POSTHOG_HOST` — optional; defaults to `https://us.i.posthog.com`

## Browser telemetry boundary

Production readiness now requires browser analytics configuration because an unmeasurable sales funnel is not considered release-ready.

The client captures only:
- `$pageview` with query strings removed;
- `richo_cta_clicked` with offer/SKU context;
- `richo_checkout_started` only after PayCore successfully creates the authoritative checkout intent;
- `richo_checkout_failed` with a bounded technical reason.

Controls:
- no email, name, payment identifier, Stripe session ID or client secret is sent;
- query strings are removed from `$current_url`;
- anonymous IDs are ephemeral in-memory only and are not persisted to cookies, localStorage or sessionStorage;
- browser Do Not Track is respected;
- sandbox checkout activity remains non-revenue;
- `richo_purchase_completed` remains a server-side live-payment event only.

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

1. Install encrypted production values and the public browser telemetry token in Vercel.
2. Use live Stripe Payment Links for the same approved AUD amounts.
3. Install the signing secret for the live Stripe webhook pointing to the canonical `/api/stripe/webhook` route.
4. Confirm `/api/ready` is 200 and reports `paymentMode: live` and `liveMoney: true`.
5. Confirm PostHog receives a real browser `$pageview` and the intended engagement events from the deployed domain.
6. Confirm the webhook list has one intended live receiver for the flow.
7. Run one owner-authorized low-risk live transaction and prove exactly one PayCore intent, one processed receipt and one live analytics checkpoint.
8. Rotate any temporary sandbox credentials that were used outside encrypted Vercel environment storage.

Do not treat a Stripe success redirect, browser event or sandbox payment as revenue evidence.

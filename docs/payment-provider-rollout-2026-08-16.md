# R.I.C.H.O. Payment Provider Rollout — 2026-08-16

Owner instruction: finish all, approve and remove blockers where technically and lawfully possible.

## Owner-approved scope

Alex Richards authorises reversible technical changes needed to complete the R.I.C.H.O. payment-provider rollout, including repository fixes, test hardening, provider sandbox configuration, webhook setup, deployment repair, monitoring and evidence capture.

This approval does **not** waive third-party KYC/KYB, settlement, payout, underwriting, legal terms, or provider account approvals. It also does not authorise fabricated approvals, bypassing provider controls, real charges/refunds/transfers without a separately verified payment action, or automatic charging of the A$48,000 offer.

## Release conditions

A provider may be marked `VERIFIED_LIVE` only when all of these are evidenced:

1. merchant/business verification approved;
2. settlement/payout destination confirmed;
3. production credentials configured through a secret store;
4. production webhook registered;
5. webhook signature validation passes;
6. idempotency / duplicate suppression passes;
7. end-to-end sandbox flow passes;
8. production health check passes;
9. first live transaction is supervised and reconciled;
10. owner emergency-disable remains available.

## Current rollout order

1. Stripe — verify remaining business/payout restrictions and live webhook path.
2. Square — finish developer app, sandbox location, A$199 checkout and signed webhook test.
3. GoCardless — create sandbox, Billing Request/mandate flow, webhook signature test, then live verification.
4. Airwallex — continue ticket #1598672, complete demo/API/payment-link onboarding after support response.
5. PayPal — sandbox REST app, Orders v2 checkout, webhook verification, then production verification.
6. Eway — sandbox Rapid API / Responsive Shared Page, result verification, then production verification.

## Non-negotiable controls

- A$199 offer amount fixed server-side.
- A$48,000 offer remains owner-reviewed and cannot auto-debit.
- Sandbox and production credentials/webhooks separated.
- No raw PAN/CVC handling by R.I.C.H.O.
- Webhook verification before fulfilment.
- Duplicate suppression before downstream actions.
- Provider failure isolation and fallback routing.
- Missing evidence reports `UNKNOWN` or `BLOCKED`, never falsely green.
- Secrets are never committed to source or pasted into support tickets.

## Status taxonomy

- `COMPLETED` — technical work finished with evidence.
- `VERIFIED_LIVE` — all release conditions passed.
- `BLOCKED_BY_PROVIDER` — provider approval/underwriting/support is pending.
- `OWNER_INPUT_REQUIRED` — a human-only legal, identity, banking, or approval step remains.
- `TECHNICAL_BLOCKER` — code, deployment, test, webhook, DNS, or runtime issue remains.

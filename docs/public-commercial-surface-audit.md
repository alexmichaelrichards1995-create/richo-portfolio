# R.I.C.H.O. public commercial surface audit

Status date: 2026-08-16 (Australia/Brisbane)

## Canonical commercial model

The canonical public offer structure for the current PayCore v3 release is:

| Offer | SKU | Price | Payment status |
|---|---|---:|---|
| R.I.C.H.O. AI Business Quick-Wins Kit | RSP-056 | A$19 AUD | Sandbox only until live Stripe cutover |
| AI Quick Fix for Small Business | RICHO-AQF-COURSE | A$49 AUD | Sandbox only until live Stripe cutover |
| AI Quick Fix Session | RICHO-AQF-SESSION | A$197 AUD | Sandbox only until live Stripe cutover |
| R.I.C.H.O. Operations Intelligence Pilot | qualification-gated | A$48,000 + applicable GST | No public checkout; qualification/agreement required |

PayCore v3 is the authoritative payment system for the three entry offers. The browser never defines price, currency, tax or payment state.

## Canonical web properties

### `richosystems.technology`

Role: primary public brand and flagship R.I.C.H.O. platform.

Current production-facing position:
- A$48,000 qualification-gated Operations Intelligence Pilot;
- no direct public checkout for the flagship engagement;
- entry-offer storefront source is prepared as `entry-offers.html` but is not yet confirmed published at `/entry-offers` on the GoDaddy-hosted public site.

### `richo-paycore-intake-api.vercel.app`

Role: canonical PayCore v3 payment service.

Verified state:
- production deployment READY;
- `/api/health` = 200;
- `/api/ready` = 200;
- database reachable with PayCore v3 schema;
- exact A$19 / A$49 / A$197 offer catalog;
- Stripe webhook route is POST-only;
- payment mode remains `sandbox` and `liveMoney=false` until live-account cutover.

## Legacy / secondary surface: `httpsrichosystems.com`

Classification: **legacy commercial surface — do not treat as canonical payment truth**.

Evidence indicates this domain was registered through GoDaddy and built/operated through GoDaddy Airo / Conversations tooling:
- GoDaddy domain registration was purchased in July 2026;
- GoDaddy Conversations receives its pilot enquiry form submissions;
- GoDaddy Airo credit packs were purchased during the same launch window.

Known public inconsistencies:
- it advertises an A$199 48-hour AI Business Improvement Pilot;
- its pilot page presents a Stripe payment CTA;
- its acquisition page reports Stripe payment integration as sandbox-provisioned and the business as pre-revenue;
- Google Search Console reported server-error (5xx) indexing failures for this domain on 2026-08-09;
- fresh external fetches on 2026-08-16 also timed out intermittently.

### Required disposition

Until the Airo site can be edited through an authenticated control plane:
1. do not direct new buyers to its payment CTA;
2. do not describe its A$199 path as the canonical R.I.C.H.O. offer;
3. prefer `richosystems.technology` for brand/navigation and the PayCore v3 catalog for pricing authority;
4. once GoDaddy Airo editor access is available, either:
   - redirect `httpsrichosystems.com` to the canonical Richo Systems site, or
   - replace the A$199/payment copy with the canonical entry catalog and live-payment state;
5. remove unsupported urgency, synthetic/live-looking activity claims or statements that imply autonomous final authority if they remain on the legacy homepage;
6. request Search Console revalidation only after the 5xx condition is resolved.

## Stripe live-account boundary

A newer Richo Systems Stripe account exists and Stripe has stated that it may accept charges while business review continues. Stripe also stated that payouts are enabled after successful review.

Current blockers before live-money activation:
- connected Stripe automation is sandbox-scoped;
- no verified live A$19 / A$49 / A$197 Payment Links are available through the connected control plane;
- live webhook signing secret is not installed in encrypted Vercel environment storage;
- temporary sandbox-only runtime credentials must be rotated out of server source before live mode;
- Stripe payout/business-review status is still awaiting support confirmation.

## Go-live truth rule

Do not claim a live sale, live checkout or revenue until all of the following are evidenced:
1. live Stripe resources belong to the current Richo Systems live account;
2. approved live Payment Links match the exact PayCore catalog;
3. live webhook is signed and mapped to the canonical PayCore endpoint;
4. runtime uses encrypted deployment secrets and `PAYMENT_MODE=live`;
5. `/api/ready` reports 200 and `liveMoney=true`;
6. one owner-authorized low-risk live transaction produces exactly one PayCore intent, one processed live webhook receipt and one live revenue analytics checkpoint.

This document is a control record, not a claim that live money is enabled.

# Richo Systems Upgrade Operating Plan

Date: 2026-08-17

## Objective

Turn the current Richo Systems portfolio into a coherent, measurable production operating stack across code, deployment, analytics, CRM, payments, documentation, and team operations.

## Release gates

1. **Source** — all production changes are reviewed through GitHub pull requests.
2. **Build** — CI must pass before merge.
3. **Deploy** — Vercel production and recovery services must have a known-good deployment.
4. **Observe** — product events, errors, and deployment health must be visible in analytics/observability.
5. **Sell** — CRM records and product catalogue must map to a clear customer journey and offer.
6. **Operate** — owners need one source of truth for incidents, launch status, revenue work, and follow-up.

## System map

| Capability | Primary system | Upgrade target |
|---|---|---|
| Source control | GitHub | Protected PR-based release flow |
| Hosting | Vercel | Healthy production + recovery path |
| Product analytics | PostHog | Activation, conversion and error visibility |
| CRM / sales | HubSpot | Clean lead -> deal -> customer pipeline |
| Payments | Payment provider | Product/price alignment and verified checkout |
| Knowledge | Notion | Single operating hub and evidence register |
| Team operations | Slack | Launch/incident/revenue communication lanes |

## Verified findings — 2026-08-17

- Upgrade work is isolated on `richo-systems-upgrade-2026-08-17` with draft PR #24 targeting `main`.
- Vercel resolves authenticated targets for PayCore green, intake, intake API, recovery, deploy-probe, and the Richo GitHub App. Project existence is not considered proof of runtime health.
- The connected PostHog project reported zero `$pageview` events for the preceding 30 days. Treat analytics as unverified until a controlled live event is captured end-to-end.
- The connected PostHog project also reported zero `$exception` events for the same period; this does not prove absence of runtime errors while instrumentation is unverified.
- HubSpot access supports the commercial object model required for Richo: contacts, companies, deals, products, line items, tasks, tickets, landing pages, and marketing email.
- Existing Notion operating records already contain PayCore production/recovery work, sales playbooks, provider evidence, and an upgrade register. Reuse these instead of creating a competing control plane.
- Slack target discovery was not verified. No messages should be sent using guessed workspace/channel identifiers.

## Priority P0

- [ ] Prove the canonical production deployment is READY and map it to its exact GitHub revision.
- [ ] Prove the recovery deployment is READY and document rollback/traffic-switch procedure.
- [ ] Reconcile historical PayCore build-failure evidence with the current Vercel state.
- [ ] Establish a canonical `/health` or equivalent endpoint with dependency-safe status reporting.
- [ ] Add a deployment smoke test covering homepage/API health and a non-destructive critical-path request.
- [ ] Restore/verify PostHog initialization on the actual production customer surface.
- [ ] Capture a controlled `richo_smoke_test` event and confirm it appears in PostHog before trusting traffic metrics.
- [ ] Define conversion events: `offer_viewed`, `lead_submitted`, `checkout_started`, `purchase_completed`, `delivery_accessed`.
- [ ] Map each sellable digital offer to one canonical name, SKU, price/currency, checkout destination, HubSpot product, and fulfilment path.
- [ ] Verify payment checkout in test/safe mode before any production configuration change.
- [ ] Resolve a real Slack workspace/channel ID before enabling operational notifications.

## Priority P1

- Add production release checklist and rollback evidence.
- Add error monitoring and conversion dashboards.
- Add a CRM follow-up cadence for qualified leads.
- Create a single Richo Systems operating dashboard/document linking source, deployments, analytics, sales, and evidence.
- Document owner-only operations that require approval and credentials.

## Canonical customer/revenue journey

`Visitor -> Offer Viewed -> Lead/Checkout -> Payment -> CRM Customer/Deal -> Digital Fulfilment -> Support -> Retention/Upsell`

Every transition must produce evidence. A system is not considered integrated merely because accounts or projects exist.

## Definition of done

A release is sale-ready only when the production URL is reachable, core journey smoke tests pass, errors are monitored, conversion events are captured, checkout is verified, offer/pricing is consistent, digital fulfilment works, CRM state is correct, and rollback instructions are recorded.

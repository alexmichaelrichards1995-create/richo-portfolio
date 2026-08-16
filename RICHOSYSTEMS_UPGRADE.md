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

## Priority P0

- Verify current Vercel deployment status for every Richo production/recovery project.
- Confirm the active application repository and deployment mapping.
- Review CI failures and remove release blockers.
- Establish a canonical health endpoint and deployment smoke test.
- Verify analytics capture on the live customer journey.
- Verify that the sales catalogue, checkout path, and CRM offer names/prices agree.

## Priority P1

- Add production release checklist and rollback evidence.
- Add error monitoring and conversion dashboards.
- Add a CRM follow-up cadence for qualified leads.
- Create a single Richo Systems operating dashboard/document linking source, deployments, analytics, sales, and evidence.
- Document owner-only operations that require approval and credentials.

## Definition of done

A release is sale-ready only when the production URL is reachable, core journey smoke tests pass, errors are monitored, conversion events are captured, checkout is verified, offer/pricing is consistent, and rollback instructions are recorded.

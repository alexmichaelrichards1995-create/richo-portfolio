# R.I.C.H.O. Shopify Operations OS

This module is the operating-intelligence layer for the R.I.C.H.O. Systems Shopify business. It is designed as an embedded Shopify Admin app using Shopify's current React Router application stack.

## Current implemented slice

- Embedded Mission Control route.
- Shopify Admin GraphQL integration for products, collections, customer count and order count.
- ShopifyQL adapter for sessions, cart additions, checkout starts, completed checkouts, orders and total sales.
- Evidence-first R.I.C.H.O. decision engine.
- Operating score, funnel metrics, next-best-action selection and evidence register.
- Human-approval perimeter: the engine recommends actions but does not automatically execute irreversible, financial or customer-impacting mutations.

## Architecture

1. Shopify is the commerce system of record.
2. Shopify Admin GraphQL provides operational entity state.
3. ShopifyQL provides commerce analytics.
4. `richo-engine.server.ts` converts observed evidence into typed findings and a prioritised next action.
5. `app._index.tsx` renders Mission Control inside Shopify Admin.
6. Future agents should consume the same evidence model and submit proposed actions into an approval queue rather than writing directly to production.

## Required Shopify setup

Create or link an app using Shopify CLI's maintained React Router template, then overlay the files in this module into the generated app. Link `shopify.app.toml.example` to the created app configuration and replace placeholder URLs through Shopify CLI configuration.

Required scopes are currently `read_products`, `read_orders`, `read_customers`, and `read_reports`. ShopifyQL reporting requires `read_reports`. Shopify also requires the applicable protected-customer-data approval for `shopifyqlQuery`.

## Security and governance

- Never commit Shopify API secrets or access tokens.
- Use Shopify's session-token / token-exchange authentication provided by the official app package.
- Store server sessions in persistent production storage.
- Keep write scopes out until a specific reviewed mutation needs them.
- Any future write agent must produce: evidence, proposed mutation, expected impact, rollback strategy, and human approval state.
- Payments, refunds, destructive catalog operations, customer messaging and live deployment remain human-approved.

## Next implementation units

- Approval Queue: persistent proposed-action records with approve/reject controls.
- Product Intelligence: detect thin descriptions, missing media, invalid cross-sells and offer-ladder gaps.
- Conversion Lab: compare funnel metrics before/after approved experiments.
- Customer Signals: segment-level retention and repeat-purchase findings without exposing unnecessary PII.
- Revenue Guard: detect order/revenue inconsistencies and discount leakage.
- AI Orchestrator: optional model-assisted recommendations behind structured schemas and deterministic policy gates.
- Audit Ledger: immutable event record of evidence, recommendations, approvals and resulting Shopify mutations.

## Production completion boundary

The code can be developed and reviewed in GitHub now. A live Shopify installation still requires the Shopify app registration/client ID, granted scopes, protected customer data approval for ShopifyQL, a production HTTPS app URL and persistent session storage. Those account-level credentials and approvals are intentionally not hard-coded into this repository.

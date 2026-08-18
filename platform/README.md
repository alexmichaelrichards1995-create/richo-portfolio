# R.I.C.H.O. Systems Command Center

Private operating software for R.I.C.H.O. Systems. This platform is intended to unify products, memberships, commerce events, AI providers, approvals, evidence, automations, and operating telemetry behind one governed control plane.

## Core architecture

1. **Command Center UI** — owner dashboard for products, customers, memberships, AI jobs, approvals, automations, evidence, revenue and system health.
2. **Integration Gateway** — adapters for Shopify, Appstle, Stripe and future services. External payloads are normalized before entering R.I.C.H.O.
3. **Product Registry** — canonical record for digital products, SKUs, pricing, entitlements, versions, delivery assets and lifecycle state.
4. **AI Gateway** — provider-neutral registry. OpenAI and other AI systems plug into one interface instead of being hard-wired throughout the application.
5. **Event Bus** — immutable operational events with correlation IDs so every cross-system workflow is traceable.
6. **Approval Gate** — high/critical-risk operations do not execute autonomously. They create explicit approval records for a named human decision-maker.
7. **Entitlement Engine** — maps purchases and memberships to digital access rights.
8. **Evidence Ledger** — events, AI jobs, approvals and integration state provide auditable operating evidence.
9. **Automation Engine** — reacts to normalized events using idempotent, retryable workflows rather than direct point-to-point side effects.
10. **Health/Observability Layer** — integration health, job failures, latency, queue depth and stale-sync indicators feed the owner dashboard.

## Initial data flows

### Shopify product sync
`Shopify product -> integration adapter -> normalize -> Product Registry -> product.synced event -> entitlement/catalog/dashboard consumers`

### Membership flow
`Appstle/Shopify membership event -> normalized membership.changed event -> entitlement recalculation -> customer access update -> evidence event`

### AI workflow
`Owner/system requests capability -> AI Gateway -> risk classification -> Approval Gate when required -> provider adapter -> result validation -> ai.job.completed event -> downstream workflow`

### Order flow
`Shopify order -> commerce.order.created -> payment/order verification -> entitlement grant -> digital delivery workflow -> evidence trail`

## Security model

- No API keys or tokens in browser code, product metadata, Git history or prompts.
- Provider secrets are injected server-side from an encrypted secret store/environment.
- Verify webhook signatures before parsing/acting on external events.
- Use least-privilege credentials per integration.
- Persist idempotency keys for externally triggered writes.
- Encrypt sensitive data at rest where applicable and use TLS in transit.
- Maintain structured audit records for approvals and consequential actions.
- High/critical risk AI jobs default to human approval.

## Provider adapter contract

Every AI provider exposes:

```js
{
  async run({ id, capability, input }) {
    // server-side provider call
    return { providerRequestId, output, usage, model };
  }
}
```

The application calls capabilities, not provider-specific APIs. This keeps R.I.C.H.O. portable across OpenAI and additional AI systems.

## Target modules

- `platform/src/orchestrator.js` — event bus, AI registry and approval gate.
- `platform/db/001_command_center.sql` — canonical operating data model.
- `platform/integrations/shopify/` — product/order/customer/webhook adapter.
- `platform/integrations/appstle/` — membership adapter.
- `platform/integrations/openai/` — OpenAI Responses API adapter.
- `platform/services/entitlements/` — access rules for purchased products/memberships.
- `platform/services/automation/` — policy-driven workflows and retries.
- `platform/api/` — authenticated owner API and webhook endpoints.
- `platform/ui/` — private command-center interface.
- `platform/tests/` — unit/integration/contract/security tests.

## Immediate implementation sequence

1. Add PostgreSQL store implementation for events, products, jobs and approvals.
2. Add signed Shopify webhook endpoint and product/order normalization.
3. Add OpenAI adapter behind the AI Gateway.
4. Add entitlement rules for product purchases and R.I.C.H.O. Pro membership.
5. Build authenticated owner dashboard with live health/approval queues.
6. Add durable job processing, retries and dead-letter handling.
7. Add Appstle membership event integration.
8. Add automated contract/integration/security tests and CI gates.
9. Add staging deployment and environment-specific secret configuration.
10. Only enable production-side effects after explicit owner review and acceptance evidence.

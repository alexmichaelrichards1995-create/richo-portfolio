# R.I.C.H.O. Systems — L2 Professional

Version target: `v1.1.0-l2`

L2 is not a feature pack. It is a whole-system maturity upgrade over certified L1.

## Mandatory upgrade dimensions
Every L1 subsystem must improve in all of these dimensions before L2 certification:
1. Complexity and functional depth
2. Automation and orchestration
3. Integrations and interoperability
4. Intelligence and decision support
5. Security and least-privilege controls
6. Observability and evidence
7. Resilience and recovery
8. Test depth and release assurance
9. Operator UX / Mission Control visibility
10. Commercial usefulness and measurable outcomes

## L2 upgrade domains
- Runtime: distributed workers, backpressure, concurrency controls, dead-letter/replay operations, lease visibility.
- Event Fabric: schema registry, version compatibility, durable replay policy, consumer health, event lineage.
- Policy/Governance: policy bundles, scoped delegation, approval SLAs, separation of duties, decision receipts.
- Security: stronger session assurance, service identities, scoped secrets, rotation enforcement, privileged-action review.
- Observability: service dashboards, SLO catalog, trace correlation, dependency maps, alert routing, incident timelines.
- Release Assurance: environment promotion rules, expanded synthetic journeys, contract suites, rollback evidence, drift checks.
- Continuity: scheduled backup verification, restore exercises, dependency failover plans, degraded-mode playbooks.
- Commerce/Shopify/Appstle: reconciliation, entitlement correctness, subscription lifecycle integrity, customer-access verification.
- AI: model/prompt registry, eval coverage, cost/latency routing, grounding requirements, canary configurations.
- Sales/Marketing: attribution, lifecycle automation, governed offers, experiment loops, CAC/LTV feedback.
- Customer Success: onboarding automation, health signals, ticket routing, entitlement-aware support, renewal risk.
- Finance: product-level unit economics, AI cost attribution, margin guardrails, budget variance and runway monitoring.
- Knowledge: provenance-aware enterprise memory, temporal truth, access controls, supersession and retrieval quality.
- Executive: richer scorecards, risks/opportunities, cross-system evidence, owner decision queue.

## L2 certification contract
A domain only counts as upgraded when it has:
- implementation delta beyond L1,
- deterministic tests,
- CI execution,
- evidence artifact,
- operational telemetry,
- documented rollback/failure mode,
- no unresolved critical security blocker.

The final L2 certificate requires all mandatory domains complete plus explicit Owner GO.

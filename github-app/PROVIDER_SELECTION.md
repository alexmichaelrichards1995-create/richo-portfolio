# R.I.C.H.O. GitHub Marketplace — Container Provider Selection

Status: **PRE-PRODUCTION / RECOMMENDATION ONLY / NO PROVISIONING**  
Research date: **2026-08-19**  
Canonical runtime contract: `github-app/HOSTING_CONTRACT.md`

This document narrows the non-production hosting candidate for the canonical GitHub Marketplace container. It does **not** authorise account creation, paid resources, production deployment, production database creation, credential installation, webhook changes, DNS changes, or migration of live data.

## Decision

**Preferred staging candidate: Render**

Use Render only as the first non-production validation target after explicit owner approval to provision resources. Production provider approval remains a separate later gate.

The current service combines HTTP handling with process-lifetime work:

- `workerTick` every 3 seconds;
- cancellation reconciliation every 60 seconds;
- PostgreSQL-backed durable jobs;
- GitHub webhooks, OAuth and Check Runs.

The selected staging platform therefore must keep one container continuously alive, actively monitor health after deployment, support a separate migration/release command, provide remote PostgreSQL, preserve secret boundaries, and offer deterministic rollback.

## Why Render is the preferred staging candidate

Render currently matches the reviewed runtime with the least architecture change:

1. Docker web services can build from the existing `github-app/Dockerfile`.
2. Paid services stay continuously available instead of relying on request-triggered execution.
3. HTTP health checks are used during deploys and continue against running instances; sustained failures can remove traffic and restart an unhealthy instance.
4. `preDeployCommand` provides a separate pre-start release phase suitable for `npm run migrate`.
5. Render Postgres is a managed PostgreSQL service and supports private connection strings, backups/recovery features on eligible paid tiers, independent storage sizing and later HA/read-replica upgrades.
6. Blueprints provide declarative service/database configuration without committing secret values.
7. Recent successful deploys can be rolled back while database recovery remains a separate operation.
8. Singapore is a supported service and database region, reducing avoidable distance from the Australian operating base.

## Alternatives retained

| Provider | Fit for current combined web + worker process | Main reason not first staging choice |
| --- | --- | --- |
| Render | **Preferred** | Best direct match for active runtime health monitoring, Docker, pre-deploy migrations and managed Postgres. |
| Railway | Viable | Persistent services and restart policies fit, but Railway's documented HTTP healthcheck is a deployment gate and is not continuously monitored after a deployment becomes live. An additional runtime watchdog would be needed for equivalent hung-process detection. |
| DigitalOcean App Platform | Viable | Supports container web services/workers/jobs and health checks, but the current Render release/rollback/managed-Postgres path maps more directly to the existing contract. |
| Fly.io | Viable with more operations | Strong Machine restart/health primitives, but requires more infrastructure-level configuration and database decisions for this first controlled staging receipt. |

No alternative is rejected permanently. Re-evaluate if provider pricing, reliability, compliance, regional availability, or the R.I.C.H.O. worker architecture changes.

## Proposed staging topology

```text
GitHub webhook/OAuth traffic
          |
          v
Render HTTPS edge
          |
          v
richo-github-app-staging
1 x continuously running Docker web-service instance
Singapore
          |
          +------ outbound HTTPS ------> GitHub API
          |
          v
Render private network
          |
          v
richo-marketplace-staging-db
Dedicated PostgreSQL
No public IP allowlist entries
```

Customer-commerce Supabase is **not** in this topology. Legacy Marketplace PostgreSQL is **not** in this topology.

## Staging Blueprint controls

The non-executable reference Blueprint is:

`github-app/deploy/render/staging.render.yaml.example`

It intentionally uses the `.example` suffix so it is not the repository's active Render Blueprint.

Required controls:

- `autoDeployTrigger: off`;
- exactly `numInstances: 1`;
- `region: singapore` for service and database;
- Docker runtime using the reviewed `github-app/Dockerfile`;
- `/health/live` deployment/runtime health path;
- `preDeployCommand: npm run migrate`;
- `DATABASE_URL` sourced from the dedicated Render Postgres resource;
- `DATABASE_SSL=true`;
- conservative `DATABASE_POOL_MAX=5` for the single staging instance;
- database public `ipAllowList: []`;
- fixed 5 GB database storage;
- storage autoscaling disabled;
- no HA standby;
- no read replicas;
- no service autoscaling;
- no custom production domain;
- no production credentials in source control.

## Secret inventory

The staging service requires **staging/test-scoped values only** for:

- `PUBLIC_BASE_URL`;
- `GITHUB_APP_ID`;
- `GITHUB_CLIENT_ID`;
- `GITHUB_CLIENT_SECRET`;
- `GITHUB_WEBHOOK_SECRET`;
- `GITHUB_PRIVATE_KEY_B64`;
- `SESSION_SECRET`;
- `ADMIN_TOKEN`.

`DATABASE_URL` is generated from the dedicated staging database reference and must not be manually copied from Supabase or the legacy Marketplace database.

Never install:

- Stripe customer-commerce keys;
- Stripe Connect keys;
- Supabase service-role/secret keys;
- production GitHub App private keys;
- production webhook secrets;
- live customer data.

## Cost-control envelope

No spend is authorised by this document.

Before any staging resource is created, the owner must approve a monthly ceiling after reviewing the provider's current checkout/dashboard quote. The initial configuration is intentionally constrained to:

- one Starter-class application instance;
- one smallest paid/basic staging PostgreSQL compute class suitable for persistence;
- 5 GB fixed database storage;
- no autoscaling;
- no high availability;
- no read replicas;
- no persistent application disk;
- no custom domain;
- no production traffic.

If the provider does not support a hard spend ceiling, configure billing alerts before the first paid resource and record the expected maximum staging duration.

## Controlled staging release sequence

After explicit provisioning approval only:

1. Create an isolated Render project/environment for Marketplace staging.
2. Create the dedicated staging PostgreSQL resource with public ingress disabled.
3. Confirm the actual monthly quote before accepting any paid resource.
4. Create a separate preview/staging GitHub App or test-scoped GitHub App configuration.
5. Populate staging-only secrets through the provider secret manager.
6. Set `PUBLIC_BASE_URL` to the generated staging HTTPS URL.
7. Keep automatic deploys disabled.
8. Deploy the exact reviewed branch/commit manually.
9. Require the pre-deploy `npm run migrate` phase to succeed before application start.
10. Require `/health/live` and `/health/ready` to return 200.
11. Run signed, invalid-signature and duplicate-delivery webhook tests.
12. Verify durable job claiming over process lifetime.
13. Verify cancellation reconciliation across at least two 60-second intervals.
14. Restart the service and prove startup does not rerun migrations.
15. Verify no credential leakage and no localhost database attempts in logs.
16. Roll back to the prior verified revision and confirm application health.
17. Re-deploy the candidate revision and confirm database state remains correct.
18. Capture receipts before any production-provider decision is proposed.

## Required observability receipt

Staging is not considered verified until evidence exists for:

- deployment/revision identity;
- application stdout/stderr capture;
- restart/crash event visibility;
- `/health/live` failure visibility;
- `/health/ready` behavior;
- HTTP 5xx visibility;
- CPU and memory metrics;
- PostgreSQL connection health;
- migration execution logs;
- successful and failed webhook audit records;
- queued/completed/failed job counts;
- rollback result.

## Production decision remains separate

A successful Render staging run does **not** automatically select Render for production. Production selection must re-evaluate:

- measured staging resource use;
- monthly cost;
- backup/PITR requirements;
- HA requirement;
- log retention requirement;
- support/SLA requirement;
- GitHub Marketplace traffic estimates;
- Australian customer/data requirements;
- security/legal review;
- disaster-recovery rehearsal.

Until the owner explicitly approves provisioning, this provider state is **RECOMMENDED / NOT PROVISIONED / NO-GO FOR PRODUCTION**.

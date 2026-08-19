# R.I.C.H.O. GitHub App — Canonical Hosting Contract

Status: **PRE-PRODUCTION / OWNER-GATED**  
Canonical runtime: **OCI container service**  
Noncanonical runtime: the existing Vercel `richo-github-app` project

This contract does not authorise deployment, DNS changes, production database creation, migration, GitHub App credential installation, or public launch.

## Decision

The canonical GitHub Marketplace service under `github-app/` is an always-running Node.js 22 container workload. It is **not** a Vercel Function/serverless workload in its current architecture.

Customer commerce remains a separate Next.js/Vercel candidate. The GitHub App must not be folded into that runtime merely because both services are JavaScript.

## Why this is required

`src/server.js` owns process-lifetime responsibilities in addition to HTTP request handling:

- an HTTP server bound to `PORT`;
- a durable database-backed job claimant that polls every 3 seconds;
- retry/dead-letter handling for jobs;
- cancellation reconciliation every 60 seconds;
- GitHub webhook processing;
- OAuth/session handling;
- GitHub Check Run creation.

A serverless request runtime with bounded function execution does not preserve those in-process intervals between requests. Converting the service to scheduled Functions, Queues or Workflows would be a separate architecture change with separate testing and review.

## Container invariants

The production image must:

1. use Node.js 22;
2. install dependencies with committed `package-lock.json` and `npm ci`;
3. run as a non-root user;
4. expose the service port, default 3000;
5. report process liveness through `/health/live`;
6. start only the application runtime with `npm start`;
7. never run database migrations implicitly during container start;
8. receive all credentials through the platform secret manager;
9. have outbound HTTPS access to GitHub APIs and the configured PostgreSQL endpoint;
10. have no local-production assumption such as `127.0.0.1:5432` for PostgreSQL.

## Process availability

Until the job engine is moved to an external queue/worker architecture, the hosting platform must keep **at least one application instance continuously running**. Scale-to-zero is not permitted because it would stop job claiming and time-based subscription reconciliation.

Multiple replicas are permitted only after the deployment environment proves database locking/idempotency behavior. The current job claimant uses `FOR UPDATE SKIP LOCKED`, and webhook deliveries are keyed for idempotency, but replica-level production behavior still requires preview/load evidence.

## Database boundary

Canonical Marketplace persistence is a dedicated remote PostgreSQL database configured only by `DATABASE_URL`.

Required rules:

- not the Supabase customer-commerce database;
- not `LEGACY_MARKETPLACE_DATABASE_URL`;
- not localhost in hosted environments;
- TLS enabled when required by the database provider;
- connection pool sized for the selected container replica count;
- migrations executed as a separate release job using `npm run migrate`.

## Release sequence

1. Build the exact reviewed `github-app/Dockerfile`.
2. Run container/image vulnerability scanning where supported.
3. Provision a non-production remote PostgreSQL database.
4. Install preview-only GitHub App credentials and secrets.
5. Run `npm run migrate` as a one-off release job.
6. Start exactly one preview container instance.
7. Require `/health/live` = 200 and `/health/ready` = 200.
8. Run signed/invalid/duplicate webhook tests.
9. Verify durable job processing and cancellation reconciliation across process lifetime.
10. Restart the container and confirm no migration is automatically executed by startup.
11. Verify runtime logs contain no localhost database attempt and no credential leakage.
12. Only after this evidence may a production container target be proposed for owner approval.

## Vercel boundary

The existing Vercel project named `richo-github-app` is considered **stale/noncanonical infrastructure** for this service because:

- its currently deployed contract does not expose the reviewed `/health/live` and `/health/ready` routes;
- its runtime has attempted PostgreSQL at `127.0.0.1:5432`;
- the reviewed service depends on process-lifetime worker/reconciler loops;
- CI verifies an OCI container as the deployment artifact.

Do not promote that Vercel project as the canonical Marketplace runtime. Do not delete it during this preparation phase; preserve it as evidence until a replacement is verified and the owner separately approves retirement.

## Health standard

### `/health/live`

Purpose: process/container liveness only.

A failing liveness check may cause the container platform to replace the instance.

### `/health/ready`

Purpose: traffic readiness. It must fail when required application configuration or the canonical database is unavailable.

Before public launch, detailed readiness component state should be restricted to an authenticated/admin diagnostic surface. The public readiness response should expose only the minimum service-ready state.

## Observability minimum

The selected container platform must provide:

- stdout/stderr log capture;
- deployment/revision identity in logs or environment;
- restart/crash visibility;
- HTTP 5xx monitoring;
- liveness/readiness failure visibility;
- CPU/memory/resource metrics;
- secret redaction controls;
- rollback to a previously verified image/revision.

Application evidence remains in PostgreSQL through `webhook_deliveries`, `jobs`, Marketplace subscription state and `audit_log`.

## Rollback

Application rollback and database rollback remain separate.

Application rollback must select a previously verified immutable image/revision. Database rollback must follow the separately rehearsed migration/backup procedure. A container rollback does not undo schema changes.

The old unhealthy Vercel deployment is **not** a valid known-good rollback target for the canonical container service.

## Owner gates

Separate explicit approval is required for:

- choosing/provisioning the production container provider;
- creating the production Marketplace database;
- applying production Marketplace migrations;
- installing production GitHub credentials;
- changing GitHub App webhook/OAuth callback URLs;
- production deployment/promotion;
- DNS cutover;
- retiring the stale Vercel `richo-github-app` project.

Until those approvals and preview receipts exist, canonical Marketplace production status remains **NO-GO**.

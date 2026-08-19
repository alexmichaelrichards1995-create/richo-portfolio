# R.I.C.H.O. GitHub App Core

Runnable GitHub App / Marketplace SaaS core for R.I.C.H.O. Systems. This service is isolated under `github-app/` and uses its own PostgreSQL domain.

## What works in this build

- GitHub webhook verification using `X-Hub-Signature-256` / HMAC-SHA256 against the exact raw request body.
- Delivery idempotency using `X-GitHub-Delivery` and a PostgreSQL primary key.
- GitHub App RS256 JWT generation and short-lived installation-token exchange.
- GitHub OAuth login with signed `state`, signed HttpOnly session cookie and no OAuth token persisted in the application database.
- Durable PostgreSQL storage for installations, subscriptions, webhook receipts, jobs and audit records.
- `marketplace_purchase` handling for `purchased`, `changed` and `cancelled`.
- Server-side feature entitlements for Free, Starter, Professional, Business and Enterprise tiers.
- Durable jobs with bounded retry, exponential backoff and dead-job state.
- PR events can create a real `R.I.C.H.O. Guard` GitHub Check Run after installation credentials are configured.
- Public liveness plus privacy-minimised readiness.
- Admin-only detailed readiness and job/replay APIs protected by `ADMIN_TOKEN`.
- Unit tests, PostgreSQL-backed integration tests, exact-container smoke tests and zero-provision staging rehearsal validation in GitHub Actions.

## Required GitHub App configuration

Use the least privilege needed for the enabled features.

### URLs

- Homepage URL: your approved public service URL
- Callback URL: `https://YOUR-HOST/auth/github/callback`
- Webhook URL: `https://YOUR-HOST/webhooks/github`

### Repository permissions for the current runnable feature set

- Metadata: Read (GitHub supplies this for installed apps)
- Pull requests: Read
- Checks: Read & write

Add `Contents: Read`, `Issues: Read`, or other permissions only when the corresponding product modules are deliberately activated. Do not request organization-administration permission for this core.

### Events

For the currently implemented handlers subscribe to:

- `installation`
- `pull_request`
- `marketplace_purchase` when the Marketplace listing/billing integration is enabled

The code can also accept `push` and `issues` events if those modules are later enabled and their permissions/events are deliberately approved.

## Environment

Copy `.env.example` into a local/deployment secret environment. Never commit real secrets.

Required for full canonical readiness:

- `DATABASE_URL`
- `GITHUB_APP_ID`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_PRIVATE_KEY` or `GITHUB_PRIVATE_KEY_B64`
- `SESSION_SECRET`
- `ADMIN_TOKEN`
- `PUBLIC_BASE_URL`

Generate security secrets from a cryptographically secure random source. Keep private keys and all secret values in the deployment provider's secret manager.

## Local run

Requirements: Node.js 22 and PostgreSQL.

```bash
cd github-app
npm ci --no-audit --no-fund
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/richo_github_app'
npm run migrate
npm run check
npm start
```

Then open `http://localhost:3000/health/live`.

Canonical startup is `node src/hardened-entrypoint.js`. Database migrations are **not** run during application/container startup.

## Docker / OCI runtime

```bash
cd github-app
docker build -t richo-github-app .
docker run --rm -p 3000:3000 --env-file .env richo-github-app
```

The image starts the application only. Run `npm run migrate` as a separate, owner-gated release/pre-deploy step against the dedicated Marketplace database before promoting a new application revision.

The canonical hosting contract is an always-running OCI container service because the current application owns recurring durable-job and cancellation-reconciliation loops. See `HOSTING_CONTRACT.md`.

## Webhook processing path

```text
GitHub
  -> raw-body capture
  -> HMAC-SHA256 verification
  -> delivery-id idempotency gate
  -> PostgreSQL transaction
  -> entitlement / installation update or durable job enqueue
  -> audit receipt
  -> HTTP 202

Worker
  -> claim queued job
  -> GitHub installation token
  -> execute bounded action
  -> done
     OR retry with backoff
     OR dead state after max attempts
```

## Marketplace lifecycle

The server treats Marketplace webhook events as the billing-entitlement input:

- `purchased` -> requested paid tier becomes active.
- `changed` -> tier is reconciled to the supplied Marketplace plan.
- `cancelled` with a future `effective_date` -> `cancellation_pending`, retaining the current tier until effective date.
- `cancelled` once effective -> Free.

A periodic reconciler expires pending cancellations whose effective date has arrived.

## Health endpoints

- `GET /health/live` — process liveness.
- `GET /health/ready` — public readiness. Response body contains only `{ "ok": true }` or `{ "ok": false }`.
- `GET /admin/health/ready` — detailed component readiness; requires `x-admin-token: <ADMIN_TOKEN>` and reports booleans only, not secret values.

Readiness fails closed if the required GitHub App/OAuth/session/admin configuration or database dependency is unavailable.

## Admin operations

`GET /admin/health/ready`, `GET /admin/jobs`, and `POST /admin/jobs/:id/replay` require an `x-admin-token` header equal to `ADMIN_TOKEN`. Never expose this token to a browser client or evidence document.

## Zero-provision staging rehearsal

The repository contains an inert rehearsal package under `rehearsal/`:

- `github-app-settings.staging.json.example` — least-privilege staging callback/webhook/event template.
- `staging.env.example` — secret-name-only staging environment template with live-money/Connect/payout gates disabled.
- `MIGRATION_BACKUP_REHEARSAL.md` — backup, migration, restore and rollback evidence procedure.
- `collect-staging-evidence.mjs` — redacted runtime/migration evidence collector for an already-approved staging service.
- `RCP_STAGING_RECEIPTS.md` — blank `RCP-STG-001` through `RCP-STG-010` evidence pack.
- `validate-rehearsal-package.mjs` — fail-closed policy validator executed by `npm run check`.

These files do not provision infrastructure, mutate GitHub App settings, install credentials, apply remote migrations, spend money or authorize production.

## Current boundary

This is a verified service core and deployment/rehearsal contract, not a claim that external staging or production infrastructure, GitHub Marketplace publisher approval, callbacks/webhooks, credentials or paid listings are already live. Those remain separate owner-gated actions.

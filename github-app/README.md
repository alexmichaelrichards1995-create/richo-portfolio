# R.I.C.H.O. GitHub App Core

Runnable GitHub App / Marketplace SaaS core for R.I.C.H.O. Systems. This service is isolated under `github-app/` so the existing portfolio site can remain unchanged.

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
- Liveness/readiness endpoints.
- Minimal signed-in dashboard.
- Admin dead-job/replay API protected by `ADMIN_TOKEN`.
- Unit tests plus PostgreSQL-backed integration tests in GitHub Actions.

## Required GitHub App configuration

Use the least privilege needed for the enabled features.

### URLs

- Homepage URL: your public service URL
- Callback URL: `https://YOUR-HOST/auth/github/callback`
- Webhook URL: `https://YOUR-HOST/webhooks/github`

### Repository permissions for the current runnable feature set

- Metadata: Read (GitHub supplies this for installed apps)
- Pull requests: Read
- Checks: Read & write

Add `Contents: Read`, `Issues: Read`, or `Deployments: Write` only when the corresponding product modules are activated. Do not request organization-administration permission for this core.

### Events

For the currently implemented handlers subscribe to:

- `installation`
- `pull_request`
- `marketplace_purchase` when the Marketplace listing/billing integration is enabled

The code can also accept `push` and `issues` events if you later subscribe to those events and enable their related modules.

## Environment

Copy `.env.example` into your deployment environment. Never commit real secrets.

Required for full readiness:

- `DATABASE_URL`
- `GITHUB_APP_ID`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_PRIVATE_KEY` or `GITHUB_PRIVATE_KEY_B64`
- `SESSION_SECRET`
- `ADMIN_TOKEN`
- `PUBLIC_BASE_URL`

Generate `SESSION_SECRET`, `ADMIN_TOKEN` and `GITHUB_WEBHOOK_SECRET` from a cryptographically secure random source. Keep the GitHub private key in the deployment platform's secret manager.

## Local run

Requirements: Node.js 22+ and PostgreSQL.

```bash
cd github-app
npm install
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/richo_github_app'
node scripts/migrate.js
npm test
node src/server.js
```

Then open `http://localhost:3000/health/live`.

`/health/ready` returns HTTP 200 only when the database and all GitHub/OAuth/security credentials required for a complete installation are present.

## Docker

```bash
cd github-app
docker build -t richo-github-app .
docker run --rm -p 3000:3000 --env-file .env richo-github-app
```

The container applies the SQL migrations before starting. For a multi-replica production deployment, move migration execution to a single release/pre-deploy job before horizontal scaling.

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

- `GET /health/live` — process is alive.
- `GET /health/ready` — database + GitHub App + OAuth + signing configuration is complete.

## Admin operations

`GET /admin/jobs` and `POST /admin/jobs/:id/replay` require an `x-admin-token` header equal to `ADMIN_TOKEN`. Do not expose this token to a browser client.

## Current boundary

This is a working service core, not a claim that the external GitHub App and paid Marketplace listing are already approved. A live end-to-end installation still requires a registered GitHub App, its generated credentials/private key, a public HTTPS deployment, PostgreSQL, and (for paid sales) GitHub Marketplace publisher/listing approval.

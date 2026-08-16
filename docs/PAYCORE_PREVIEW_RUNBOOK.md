# PayCore Preview Deployment Runbook

## Purpose
Run the reconstructed PayCore API against the isolated Vercel probe project without touching the live `richo-paycore-intake-api` production service.

## Workflow
GitHub Actions workflow: `.github/workflows/paycore-preview-deploy.yml`

Run only from branch: `richo-systems-upgrade-2026-08-17`

Target Vercel project:
- Name: `richo-paycore-deploy-probe`
- Project ID: `prj_FLgF3j6ty9VSSImjvT8hoKAeK8Bs`
- Team ID: `team_nelzyuU71azKli5ThIr26ppU`

## Required GitHub Actions secrets
Configure these at repository level before dispatching the workflow:

- `VERCEL_TOKEN`
- `PAYCORE_PREVIEW_DATABASE_URL` — preview/test database only
- `PAYCORE_PREVIEW_WEBHOOK_SECRET` — dedicated non-production webhook secret

Do not use a production-write database. Do not add production Stripe live keys to this workflow.

## Safety invariants
The workflow must preserve all of the following:

- branch must not be `main`
- Vercel deploy command must not use `--prod`
- `PAYMENT_MODE=sandbox`
- `LIVE_MONEY=false`
- `CHECKOUT_ENABLED=false`
- `PAYMENT_LINKS_CONFIGURED=false`
- checkout returns the `preview_sandbox_only` marker
- production PayCore project is not modified

## Expected execution sequence
1. Checkout the exact workflow commit.
2. Install Node.js 24.
3. Verify the three required preview secrets are present.
4. Install reconstruction dependencies.
5. Run the local reconstruction contract test.
6. Run a real Next.js production build.
7. Deploy to the isolated Vercel project as a preview deployment.
8. Verify `/api/health`, `/api/ready`, and `/api/offers`.
9. POST to `/api/checkout/quick-wins-kit` and require the `preview_sandbox_only` safety marker.
10. Inspect Vercel runtime error logs. Failure to inspect logs is a failed gate.
11. Record preview URL, Git SHA, and Vercel project ID in the GitHub Actions job summary.

## Acceptance evidence
Before issue #26 can be closed or PR #24 considered for merge, record:

- exact Git commit SHA deployed
- exact preview deployment URL and deployment ID
- CI success for the same SHA
- successful Next.js build
- HTTP 200 `/api/health`
- HTTP 200 `/api/ready` with preview database reachable
- `/api/offers` matching the canonical AUD offer identities and amounts
- blocked checkout proof
- webhook route present and sandbox-only/no-side-effects
- runtime errors: zero or explicitly reviewed and accepted
- current production and recovery deployment IDs captured as rollback evidence

## Stop conditions
Do not merge or promote if any of these occur:

- deployment is created against the production PayCore project
- live-money or checkout flags become enabled
- a production-write database or live Stripe key is introduced
- readiness is degraded or database is unreachable
- offer identity/price contract changes unexpectedly
- runtime errors are unreviewed
- deployment cannot be tied to the expected Git SHA

Production remains unchanged until all acceptance evidence is present.

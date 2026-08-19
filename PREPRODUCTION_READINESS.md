# R.I.C.H.O. Systems Pre-Production Readiness Runbook

Status: **PRE-PRODUCTION / OWNER-GATED / NO LIVE ACTIVATION**  
Reviewed against integration branch: `agent/integrate-commerce-marketplace`  
Review date: 2026-08-19 (Australia/Brisbane)

This runbook is a release-control document. It does not authorise merge, remote database migration, production deployment, payment activation, Stripe Connect activation, payout, or public launch.

## 1. Release decision

Current decision: **NO-GO for production activation**.

The integration code is CI-verified, but the connected live infrastructure is not yet aligned with the reconciled architecture.

### Blocking observations

1. **Customer commerce has no dedicated Vercel project yet.** The connected Vercel inventory contains `richo-github-app` and older PayCore projects, but no project mapped to the new root Next.js/Supabase customer-commerce application.
2. **Live Supabase does not contain the commerce schema.** The connected project `lgtrrngjtgfbcjjyepta` currently has `threads`, `thread_members`, and `messages`; its migration history is empty. The branch migrations for `products`, `orders`, `order_items`, `entitlements`, `customer_subscriptions`, `audit_events`, and `payment_events` have not been applied remotely.
3. **The expected private delivery bucket is not live.** Live Storage currently has a different bucket named `Alex Richards`, configured public. Do not reuse it for commerce. Production commerce requires a distinct private `richo-digital-deliveries` bucket with the branch's restricted file policy.
4. **Supabase leaked-password protection is disabled.** Enable leaked-password protection before public customer authentication is approved.
5. **Existing `richo-github-app` production is unhealthy.** The production domain currently returns HTTP 500 because the deployed runtime attempts PostgreSQL at `127.0.0.1:5432`. A serverless production deployment requires a real remote canonical Marketplace `DATABASE_URL`.
6. **The current Vercel `richo-github-app` project is configured as Node 24.x while repository packages require Node 22.** Vercel documents that `package.json` `engines.node` overrides the project setting, but the replacement preview must prove Node 22 before promotion.
7. **Existing production deployments are not trusted rollback targets for the reconciled service.** They predate the integrated architecture and include the current database failure. Establish one healthy preview/production baseline before relying on Vercel rollback.

## 2. Architecture boundaries that must remain true

### Customer commerce

Runtime: root Next.js application.  
Database: Supabase customer-commerce project only.  
Subscription table: `customer_subscriptions`.  
Stripe credential: `STRIPE_RESTRICTED_KEY`.  
Webhook secret: customer-commerce `STRIPE_WEBHOOK_SECRET`.  
Live-payment gates: `STRIPE_MODE=live` **and** `RICHO_LIVE_PAYMENTS_ENABLED=true`.

### Canonical GitHub Marketplace

Runtime: `github-app/`.  
Database: dedicated remote PostgreSQL database.  
Subscription table: `marketplace_subscriptions`.  
This database must not be the Supabase customer database and must not be the legacy database.

### Legacy Marketplace compatibility

Runtime: root compatibility modules.  
Database: dedicated `LEGACY_MARKETPLACE_DATABASE_URL`.  
Subscription table: `legacy_marketplace_subscriptions`.  
Connect credential: `STRIPE_CONNECT_SECRET_KEY`.  
Connect gate: `RICHO_MARKETPLACE_CONNECT_ENABLED=true`.  
Payout gate: `RICHO_LIVE_PAYOUTS_ENABLED=true`.

No release may collapse these three credential or persistence domains.

## 3. Required environment inventory

Values must be installed through the hosting/provider secret manager. Never commit real values.

### Customer commerce — browser-safe

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

### Customer commerce — server only

- `SUPABASE_SECRET_KEY` (preferred) or legacy `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_MODE`
- `RICHO_LIVE_PAYMENTS_ENABLED`
- `STRIPE_RESTRICTED_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SITE_URL`

Production must keep these disabled/absent until the payment activation gate:

- `STRIPE_TEST_MOCK_ENABLED=false`
- no Stripe mock host may be used for production

### Canonical GitHub Marketplace — server only

- `PUBLIC_BASE_URL`
- `DATABASE_URL`
- `DATABASE_SSL`
- `DATABASE_POOL_MAX`
- `GITHUB_APP_ID`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_WEBHOOK_SECRET`
- exactly one of `GITHUB_PRIVATE_KEY` or `GITHUB_PRIVATE_KEY_B64`
- `SESSION_SECRET`
- `ADMIN_TOKEN`

### Legacy Marketplace compatibility — server only

- `LEGACY_MARKETPLACE_DATABASE_URL`
- `ALLOW_FILE_STORE=false`
- compatibility `GITHUB_WEBHOOK_SECRET` if that lane remains enabled
- `STRIPE_CONNECT_SECRET_KEY`
- `RICHO_MARKETPLACE_CONNECT_ENABLED=false` until separately approved
- `RICHO_LIVE_PAYOUTS_ENABLED=false` until separately approved

## 4. Required release order

Every stage is stop/go. A failure stops the release; do not continue by bypassing a gate.

### Stage A — owner review

- PR #34 remains draft until owner review is complete.
- Confirm the exact integration head SHA and green reconciliation CI receipt.
- Confirm root and `github-app` lockfiles are committed and all release CI uses `npm ci`.
- Confirm no unresolved security/review findings.

### Stage B — non-production infrastructure

- Create/link a dedicated Vercel preview project for the root customer-commerce app.
- Configure preview-only Supabase and Stripe test credentials.
- Configure the GitHub App preview with a remote non-production PostgreSQL database, never `localhost`.
- Verify Node 22 in both preview builds.
- Do not use the current public `Alex Richards` Storage bucket for commerce delivery.

### Stage C — database rehearsal

Preferred path: Supabase development branch or disposable project.

- Apply the exact committed commerce migrations in order.
- Create/verify `richo-digital-deliveries` as private.
- Seed the canonical `RICHO-PILOT-199` record and onboarding object.
- Run pgTAP/database contracts and Supabase security/performance advisors.
- Generate TypeScript types and compare them with the committed application contract.
- Test rollback from a pre-migration snapshot/branch before production schema application.

### Stage D — preview application verification

Customer commerce:

- `GET /api/health` => 200.
- `GET /api/health/ready` => 200 only after required server configuration and commerce schema are available.
- login/signup/password recovery works against preview Auth.
- controlled Stripe test Checkout succeeds.
- signed webhook changes order to paid.
- exactly one entitlement is created on duplicate delivery.
- service onboarding/download access is entitlement-gated.
- signed asset URLs expire as configured.
- delivery receipt is recorded.
- Customer Portal launches only for the authenticated customer's Stripe customer ID.

GitHub Marketplace:

- `GET /health/live` => 200.
- `GET /health/ready` => 200 with remote database and GitHub App configuration.
- valid signed webhook is accepted.
- invalid signature is rejected.
- duplicate delivery is idempotent.
- Marketplace subscription migration and job processing pass.
- production dependency audit and container build remain green.

### Stage E — production infrastructure preparation

Still no money movement.

- Take/verify a production database backup or provider rollback point.
- Configure customer Vercel project and canonical GitHub App project with production secret names but keep money/Connect/payout gates off.
- Apply production commerce migration only after explicit owner approval.
- Verify the commerce tables and private Storage bucket after migration.
- Re-run Supabase security advisors. No new ERROR/HIGH issues are acceptable.
- Enable Supabase leaked-password protection.
- Register the production Stripe webhook only after the production endpoint is healthy.
- Keep `RICHO_LIVE_PAYMENTS_ENABLED=false` during infrastructure validation.

### Stage F — production smoke test with money still disabled

- Customer liveness = 200.
- Customer readiness = 503 while the live-money gate is intentionally off if production Stripe mode is live.
- GitHub App liveness = 200.
- GitHub App readiness = 200.
- zero unexpected Vercel runtime error clusters.
- no application attempts database access at localhost.
- verify all canonical domains and redirect URLs use HTTPS.

### Stage G — explicit owner activation gate

Only the owner can approve:

1. move PR #34 out of draft;
2. merge to `main`;
3. promote the reviewed preview deployment;
4. enable `STRIPE_MODE=live`;
5. enable `RICHO_LIVE_PAYMENTS_ENABLED=true`;
6. enable Marketplace Connect;
7. enable payouts;
8. publish the final public sales path.

These are separate approvals. Approval of one is not approval of the others.

## 5. Health and observability standard

### Customer commerce

- `/api/health` is liveness only and must not expose configuration state.
- `/api/health/ready` is fail-closed and must not reveal secret names or detailed component state to the public response.
- Checkout/webhook failures use server logs with order/event correlation identifiers, not credentials.
- `payment_events` remains the durable Stripe event ledger.
- `audit_events` remains the customer delivery/commercial audit ledger.

### GitHub Marketplace

- `/health/live` is process liveness.
- `/health/ready` must be healthy before traffic promotion.
- Vercel runtime errors must show no database connection failures.
- GitHub webhook deliveries and jobs are durable in their dedicated PostgreSQL database.

### Minimum post-promotion observation

Immediately after a production promotion:

- verify health endpoints;
- inspect Vercel production runtime errors/logs;
- verify Stripe/GitHub webhook delivery status;
- verify database connection health and error rate;
- verify no duplicate entitlements/subscriptions;
- stop promotion/activate rollback on sustained 5xx, readiness failure, database connectivity failure, webhook signature regression, or unexpected money movement.

## 6. Rollback plan

Application rollback and database rollback are different operations.

### Application

Vercel supports rolling production traffic back to a previous deployment. The selected rollback target must itself have a previously verified healthy readiness receipt. Do **not** use the current unhealthy `richo-github-app` production deployment as the future known-good baseline.

### Customer database

Before applying production migrations:

- capture a provider-supported backup/rollback point;
- record current schema/migration state;
- confirm migration order and forward compatibility;
- test the migration on a branch/disposable environment first.

If application rollback occurs after a non-backward-compatible database migration, restore/repair the schema according to the tested database rollback procedure before declaring recovery complete.

### Money movement

If payment or payout anomalies occur:

- disable the relevant R.I.C.H.O. gate first;
- stop promotion/traffic if required;
- preserve payment/webhook/audit evidence;
- do not delete provider events or rewrite commercial history to simulate recovery.

## 7. Current blocker register

| ID | Blocker | Severity | Exit evidence |
|---|---|---:|---|
| PRE-001 | No customer-commerce Vercel project/preview | Blocker | Dedicated preview deployment passes liveness/readiness and controlled purchase |
| PRE-002 | Live Supabase commerce migrations absent | Blocker | Rehearsed and owner-approved production migration receipt |
| PRE-003 | Private commerce Storage bucket absent | Blocker | `richo-digital-deliveries` exists, private, policy verified |
| PRE-004 | Supabase leaked-password protection disabled | High | Auth security setting enabled and advisor rechecked |
| PRE-005 | Existing GitHub App production HTTP 500 | Blocker | New preview + promoted deployment has healthy remote DB and zero relevant runtime errors |
| PRE-006 | Existing GitHub App production DB points to localhost | Blocker | Remote dedicated `DATABASE_URL`; `/health/ready` 200 |
| PRE-007 | Healthy rollback baseline not established | High | Verified production deployment recorded as rollback candidate |
| PRE-008 | Production secrets and provider webhooks not yet validated | Blocker | Secret-name checklist + readiness + provider delivery receipt |

## 8. Owner sign-off checklist

A production GO requires all boxes below and explicit owner approval.

- [ ] PR #34 exact head reviewed.
- [ ] Authoritative reconciliation CI green for that head.
- [ ] Security review has no unresolved reportable finding.
- [ ] Customer preview project exists and is healthy.
- [ ] Canonical GitHub App preview exists and is healthy.
- [ ] Node 22 verified in both preview builds.
- [ ] Supabase commerce migration rehearsed outside production.
- [ ] Production backup/rollback point verified.
- [ ] Production commerce schema applied under separate owner approval.
- [ ] `richo-digital-deliveries` exists and is private.
- [ ] Supabase leaked-password protection enabled.
- [ ] Supabase security advisors reviewed after migration.
- [ ] Customer production liveness/readiness validated.
- [ ] GitHub App production liveness/readiness validated.
- [ ] Production runtime errors reviewed and acceptable.
- [ ] Stripe production webhook endpoint healthy and signed delivery verified.
- [ ] Live payment gate separately approved.
- [ ] Marketplace Connect gate separately approved, if required.
- [ ] Payout gate separately approved, if required.
- [ ] Known-good Vercel rollback deployment recorded.
- [ ] Owner records final GO decision and activation scope.

Until every required release gate is satisfied, status remains **NO-GO / PRE-PRODUCTION**.

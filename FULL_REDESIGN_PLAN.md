Full Redesign Plan — Production-ready Marketplace App

Goal
Make the Marketplace integration production-ready end-to-end: durable subscription provisioning, reliable billing/payouts, Enterprise SSO, robust CI with migrations/e2e tests, and secure operations.

Scope
- Webhook processing (idempotent, durable)
- Postgres schema & migrations, transactional upserts
- Stripe Connect: onboarding, payouts, reconciliation
- SSO/SAML production integration (passport-saml)
- Frontend billing/settings dashboard
- CI: run migrations, stripe-mock, e2e tests, protect main branch
- Security & compliance checklist

Milestones
1) DB & migrations
  - Finalize schema, run migrations, implement upsert queries
  - Add db migrations runner and CI step
  - Migrate test JSON stores into DB
2) Billing & Stripe
  - Implement connected account onboarding
  - Create payout job, ledger, retries, and reconciliation
  - Add integration tests using stripe-mock/test keys
3) Webhook -> Provisioning
  - Ensure delivery GUID idempotency + transactional upsert
  - Move heavy work into job queue; return 200 fast
4) SSO / Enterprise
  - Implement passport-saml SP metadata & ACS endpoints
  - Test with Okta/OneLogin; map attributes to orgs
5) Frontend & UX
  - Billing dashboard, trial flows, Stripe portal links
  - Admin views for org owners
6) CI / E2E / Hardening
  - Run migrations in CI, start stripe-mock service, run e2e tests
  - Security scan, secrets rotation, logging & monitoring

Validation
- CI passes (unit + integration + e2e)
- Manual test with a test Stripe account and simulated marketplace_purchase webhooks
- SSO test with an IdP test tenant
- Recovery plan exercised (restore from backup)

Next immediate tasks (this session)
- Implement transactional Postgres upserts and migration runner (db-prod-migration-and-upsert)
- Implement Stripe Connect end-to-end (stripe-full-integration)
- Add CI e2e tests to run stripe-mock and migrations (ci-e2e-tests)

Owners & ETA
- Owner: engineering lead (assign per task)
- ETA (MVP): 2–4 sprints depending on team size

Notes
- Keep the webhook handler lightweight: validate signature, enqueue work, and respond 200.
- Use idempotency keys (x-github-delivery) and DB unique constraints to prevent duplicate work.
- Use Stripe test mode and stripe-mock for deterministic CI tests.

Files/Places to update
- db/ (migrations, db_client)  
- subscriptions_service.js  
- stripe_connect.js  
- marketplace_webhook_handler.js  
- .github/workflows/ci.yml (e2e additions)  
- docs/SSO_SETUP.md  

If this plan looks good, begin by implementing the DB transactional upsert and CI migration step now.\nLast CI trigger: 2026-08-11T01:05:14.1596299+10:00\n

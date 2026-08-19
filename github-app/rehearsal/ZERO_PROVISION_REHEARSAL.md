# R.I.C.H.O. Marketplace Zero-Provision Staging Rehearsal

Status: **CODE-ONLY / NO PROVIDER PROVISIONING / NO EXTERNAL CONFIGURATION MUTATION / NO SPEND**

This package turns the future staging activation into a controlled evidence sequence. It does not create infrastructure, install secrets, mutate GitHub App settings, change callback/webhook URLs, run remote migrations, or authorise production.

## Package

1. `github-app-settings.staging.json.example` — least-privilege GitHub App staging settings template.
2. `staging.env.example` — staging-only environment/secret-name template with payment, Connect and payout gates disabled.
3. `MIGRATION_BACKUP_REHEARSAL.md` — backup, migration and restore procedure.
4. `ROLLBACK_DRILL.md` — immutable-image + restored-database rollback drill.
5. `collect-staging-evidence.mjs` — redacted health/readiness + migration inventory collector.
6. `collect-webhook-job-evidence.mjs` — read-only webhook/job receipt collector.
7. `collect-oauth-session-evidence.mjs` — read-only pre-login OAuth boundary collector.
8. `RCP_STAGING_RECEIPTS.md` — blank `RCP-STG-001` through `RCP-STG-010` receipt ledger.
9. `validate-rehearsal-package.mjs` — fail-closed package policy validator.

## Rehearsal phases

### Phase A — source-only validation

Run before any staging resource exists:

```bash
cd github-app
npm ci --no-audit --no-fund
npm run rehearsal:validate
npm run check
```

Expected result: templates, evidence law, runtime tests and package contracts pass without using external staging infrastructure.

### Phase B — owner-approved resource identity

Only after separate approval:

- provision one staging OCI service + one dedicated staging PostgreSQL database;
- install staging/test GitHub App secret references;
- leave auto-deploy disabled;
- keep one app instance;
- keep database public ingress disabled;
- record `RCP-STG-001`, `002`, and `010`.

No production provider decision is implied.

### Phase C — database rehearsal

- create pre-migration backup/snapshot;
- validate backup readability;
- execute `npm run migrate` once as a release operation;
- run checks;
- record `RCP-STG-003`;
- run the fresh-target rollback drill and record `RCP-STG-009`.

### Phase D — runtime health

Against the already-approved staging service:

```bash
node rehearsal/collect-staging-evidence.mjs staging-evidence.json
```

Verify liveness, privacy-minimal public readiness and admin diagnostics. Record `RCP-STG-004`.

### Phase E — GitHub staging integration

Only after separate approval to mutate the staging GitHub App configuration:

- set staging homepage/callback/webhook URLs from the template;
- use only the listed permissions/events;
- deliver a controlled staging event;
- capture the GitHub delivery ID without recording webhook secret material;
- inspect the durable receipt/job with the read-only collector;
- record `RCP-STG-005` and `RCP-STG-006`.

Example read-only collection after a delivery/job already exists:

```bash
RCP_WEBHOOK_DELIVERY_ID='<non-secret-delivery-id>' \
RCP_JOB_ID='<numeric-job-id>' \
node rehearsal/collect-webhook-job-evidence.mjs webhook-job-evidence.json
```

### Phase F — OAuth/session boundary

Before interactive sign-in:

```bash
node rehearsal/collect-oauth-session-evidence.mjs oauth-boundary-evidence.json
```

Then perform a controlled staging login manually and record only boolean/session-property evidence in `RCP-STG-007`. Never store OAuth codes, access tokens or cookie values.

### Phase G — observability + closeout

- confirm structured logs and health monitoring;
- exercise a safe failure/retry path if approved;
- verify secret redaction;
- record `RCP-STG-008`;
- reconcile all ten receipts.

The rehearsal is complete only when every receipt is `VERIFIED` or explicitly `BLOCKED` with a reason.

## Hard stops

Stop immediately if:

- environment identity is not unambiguously staging;
- any URL/database string appears production-like;
- a customer-commerce Supabase or legacy Marketplace credential is present;
- a secret value appears in evidence output;
- public readiness exposes more than `ok`;
- backup/restore evidence is missing;
- migration is proposed at container startup;
- auto-deploy, autoscaling or multiple staging instances appear without a new owner decision;
- any action would incur spend or mutate an external system without explicit approval.

## Authority boundary

A successful zero-provision rehearsal package is evidence that the procedure is **CODED and CI-VERIFIED**. It is not evidence that staging is `PROVISIONED`, `CONFIGURED`, or `LIVE`. Those statuses require actual owner-approved external execution and receipts.

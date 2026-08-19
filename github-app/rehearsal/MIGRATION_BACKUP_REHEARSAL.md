# Marketplace Staging Migration + Backup Rehearsal

Status: **ZERO-PROVISION / NO LIVE DATABASE MUTATION AUTHORISED**

This procedure defines the evidence required before a staging Marketplace database may be considered migration-ready. It is provider-neutral and must be executed only against a separately approved staging database. It must never be pointed at the customer-commerce Supabase database, the legacy Marketplace database, or any production database.

## Required environment identity

Before any database command:

- `RICHO_ENVIRONMENT=staging`
- dedicated Marketplace `DATABASE_URL`
- `DATABASE_SSL=true` when the provider requires TLS
- no `LEGACY_MARKETPLACE_DATABASE_URL`
- no Supabase service-role/secret key
- no Stripe live key
- no production hostname in the database connection receipt

Record only a redacted database identity: provider resource ID, database name, region, engine/version and last four non-sensitive characters of an internal resource reference if useful. Never record the password or full connection string.

## Rehearsal sequence

1. **Source freeze receipt** — record the exact Git commit SHA and OCI image digest selected for rehearsal.
2. **Connection boundary check** — prove the target is the dedicated staging Marketplace database.
3. **Pre-migration inventory** — record migration filenames and SHA-256 hashes from `github-app/sql/`.
4. **Backup** — create a provider snapshot or `pg_dump --format=custom` backup before applying migrations.
5. **Backup validation** — validate the backup is readable (`pg_restore --list` for custom dumps or provider snapshot status = ready).
6. **Migration** — execute exactly `npm run migrate` from the selected source revision.
7. **Post-migration verification** — run the canonical integration suite and verify required tables/constraints exist.
8. **Application readiness** — start the exact OCI image and verify `/health/live` and minimal public `/health/ready` behavior.
9. **Rollback drill** — restore into a fresh staging database or provider restore target; do not destructively overwrite the only rehearsal database.
10. **Receipt closeout** — mark `RCP-STG-003` and `RCP-STG-009` VERIFIED only when both forward migration and restore evidence exist.

## Command model

Example only; substitute an approved staging secret at execution time through the provider secret manager or shell environment. Do not paste credentials into command history or evidence files.

```bash
cd github-app
npm ci --no-audit --no-fund
npm run migrate
npm run check
```

For a direct PostgreSQL backup rehearsal where policy permits:

```bash
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > marketplace-staging.backup
pg_restore --list marketplace-staging.backup > marketplace-staging.backup.list
```

The backup file itself is sensitive operational data. It must not be committed to Git or uploaded to public CI artifacts.

## Rollback acceptance criteria

Rollback is **VERIFIED** only when:

- the backup/snapshot was created before the migration;
- the backup/snapshot can be enumerated or restored;
- restore targets a fresh isolated staging database/resource;
- restored schema passes the expected pre-migration or selected rollback revision checks;
- the prior immutable OCI image can be started against the restored target;
- liveness succeeds;
- no production DNS, webhook, callback or payment state was touched.

## Failure behavior

Any failed backup, migration, restore, health or boundary check sets the related receipt to `FAILED` or `BLOCKED`. Do not continue to callback/webhook activation after a database rehearsal failure.

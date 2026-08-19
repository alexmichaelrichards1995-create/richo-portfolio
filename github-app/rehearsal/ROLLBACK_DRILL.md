# Marketplace Staging Rollback Drill

Status: **ZERO-PROVISION / REHEARSAL DESIGN ONLY / NO DESTRUCTIVE RESTORE AUTHORISED**

The rollback drill proves that a failed staging release can return to a known-good application + database state without using production infrastructure or the stale Vercel deployment.

## Inputs

- current staging source commit SHA
- current staging OCI image digest
- prior known-good OCI image digest
- pre-migration staging database backup/snapshot reference
- fresh isolated restore target identity
- dedicated staging GitHub App identity
- staging-only secret references

Never record raw secret values or full database connection strings.

## Drill

1. Freeze staging traffic changes. Do not modify production DNS, callbacks, webhooks or credentials.
2. Record the failed/current source revision and image digest.
3. Confirm the pre-migration backup/snapshot is readable and associated with the correct staging database.
4. Create a **fresh restore target**; do not overwrite the only staging database as the first rollback test.
5. Restore the snapshot/backup into that target.
6. Run schema verification against the restored target.
7. Start the prior immutable OCI image against the restored target with staging-only credentials.
8. Verify `GET /health/live` returns 200.
9. Verify public `GET /health/ready` contains only the `ok` field.
10. Verify anonymous `GET /admin/health/ready` is rejected.
11. Verify authenticated admin readiness returns booleans only and contains no credential values.
12. Confirm worker startup does not run migrations.
13. If webhook routing was previously activated in staging, switch it only after the restored target is verified; this external mutation requires its own owner-approved staging execution step.
14. Record `RCP-STG-009` as `VERIFIED` only after restore + prior image + health evidence all exist.

## Failure conditions

Mark `RCP-STG-009` `FAILED` or `BLOCKED` if any of these occur:

- backup cannot be enumerated/restored;
- restore target identity is ambiguous;
- restored schema does not match the rollback revision;
- prior image cannot start;
- liveness fails;
- public readiness leaks component details;
- migration executes during container startup;
- any production resource is touched;
- the stale Vercel `richo-github-app` deployment is proposed as the rollback target.

## Exit condition

A successful rollback rehearsal authorises nothing beyond the evidence statement that staging rollback was verified. It does not authorise production deployment, production database restoration, DNS changes, Marketplace activation, payments, Connect, payouts, merge, or provider spend.

# PayCore Production SSL Hardening

Vercel runtime telemetry on `richo-paycore-green` reported a PostgreSQL client warning that `sslmode=prefer`, `require`, and `verify-ca` are currently treated as aliases for `verify-full`, but future `pg-connection-string` / `pg` major versions will adopt standard libpq semantics with weaker guarantees for some modes.

## Required production change

Use an explicit certificate-verifying production connection mode:

- preferred: `sslmode=verify-full` in the production `DATABASE_URL` when the database hostname and CA chain are valid;
- do not silently downgrade to `rejectUnauthorized: false` in production;
- if a managed database requires a provider-specific CA bundle, configure that CA through the hosting secret/environment system;
- keep development/test behavior separate from production.

## Verification gate

After the environment change:

1. redeploy `richo-paycore-green`;
2. call `/api/index` and all health/payment intake routes;
3. verify no TLS/SSL warning remains;
4. verify database queries succeed;
5. review Vercel runtime errors for at least one clean production request;
6. only then close the SSL blocker.

No database credentials belong in this repository.

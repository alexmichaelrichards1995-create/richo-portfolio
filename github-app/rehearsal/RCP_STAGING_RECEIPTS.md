# R.I.C.H.O. Marketplace Staging Receipt Pack

Status: **BLANK / ZERO-PROVISION / NO EXTERNAL ACTION AUTHORISED**

Allowed states: `PLANNED`, `PROVISIONED`, `CONFIGURED`, `VERIFIED`, `FAILED`, `BLOCKED`, `RETIRED`.

Never paste passwords, connection strings, OAuth client secrets, webhook secrets, private keys, session secrets, admin tokens, installation tokens, access tokens, cookies, signed URLs, or raw credential-bearing headers into this pack.

## RCP-STG-001 — Provider resource receipt

- State: `PLANNED`
- Provider:
- Region:
- Service resource ID:
- Database resource ID:
- Service class/size:
- Database class/size:
- Auto-deploy disabled evidence:
- Public database ingress disabled evidence:
- Cost ceiling/budget evidence reference:
- Recorded by:
- Recorded at:

## RCP-STG-002 — Immutable source receipt

- State: `PLANNED`
- Git commit SHA:
- OCI image digest:
- Node runtime:
- Lockfile hash/reference:
- Build/run receipt reference:
- Recorded by:
- Recorded at:

## RCP-STG-003 — Database migration receipt

- State: `PLANNED`
- Dedicated staging database identity reference:
- Pre-migration backup/snapshot reference:
- Migration inventory hash/reference:
- `npm run migrate` execution reference:
- Post-migration verification reference:
- Production/customer/legacy database exclusion verified: `NO`
- Recorded by:
- Recorded at:

## RCP-STG-004 — Health receipt

- State: `PLANNED`
- `/health/live` status:
- `/health/ready` status:
- Public readiness body contains only `ok`: `NO`
- Anonymous `/admin/health/ready` rejected: `NO`
- Authenticated admin readiness verified without secret values: `NO`
- Evidence collector output reference:
- Recorded by:
- Recorded at:

## RCP-STG-005 — GitHub webhook receipt

- State: `PLANNED`
- Staging GitHub App ID/reference:
- Webhook URL host/reference:
- Event type:
- GitHub delivery ID:
- Signature verification outcome:
- HTTP response status:
- Duplicate/idempotency replay outcome:
- Database webhook receipt ID/reference:
- No webhook secret value recorded: `NO`
- Recorded by:
- Recorded at:

## RCP-STG-006 — Durable job receipt

- State: `PLANNED`
- Trigger event/delivery reference:
- Job ID:
- Job kind:
- Initial state:
- Final state:
- Attempts:
- Check Run/reference if applicable:
- Audit record/reference:
- Dead/retry path tested if part of rehearsal:
- Recorded by:
- Recorded at:

## RCP-STG-007 — OAuth/session receipt

- State: `PLANNED`
- Staging callback host/reference:
- OAuth state validation: `NO`
- Successful GitHub login redirect: `NO`
- Session cookie HttpOnly: `NO`
- Session cookie Secure on HTTPS: `NO`
- Session cookie SameSite=Lax: `NO`
- Tampered session rejected: `NO`
- OAuth access token absent from application database: `NO`
- No OAuth token/cookie value recorded: `NO`
- Recorded by:
- Recorded at:

## RCP-STG-008 — Observability receipt

- State: `PLANNED`
- Structured service log available: `NO`
- Deployment/startup log reference:
- Webhook failure log reference/test:
- Worker failure/retry log reference/test:
- Health monitoring configured: `NO`
- Alert destination/reference:
- Secret-redaction check: `NO`
- Recorded by:
- Recorded at:

## RCP-STG-009 — Rollback receipt

- State: `PLANNED`
- Pre-change backup/snapshot reference:
- Prior OCI image digest:
- Fresh restore target reference:
- Restore completed: `NO`
- Restored schema verification: `NO`
- Prior image started against restore target: `NO`
- `/health/live` after rollback: `NO`
- Production DNS/webhook/callback untouched: `NO`
- Recorded by:
- Recorded at:

## RCP-STG-010 — Cost-control receipt

- State: `PLANNED`
- Provider plan/service class:
- Database plan/class:
- Maximum instance count:
- Autoscaling disabled: `NO`
- HA/read replicas disabled: `NO`
- Storage autoscaling disabled or capped: `NO`
- Budget/alert threshold:
- Auto-deploy disabled: `NO`
- Owner-approved staging spend reference:
- Recorded by:
- Recorded at:

## Closeout rule

The rehearsal is not complete until `RCP-STG-001` through `RCP-STG-010` are each either `VERIFIED` or explicitly `BLOCKED` with a documented reason. `CONFIGURED` is not equivalent to `VERIFIED`. Production approval cannot be inferred from a successful staging rehearsal.

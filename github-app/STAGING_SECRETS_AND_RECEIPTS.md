# R.I.C.H.O. GitHub App — Staging Secrets & Evidence Receipts

Status: **PRE-PRODUCTION / PROVIDER-NEUTRAL / NO PROVISIONING AUTHORISED**

This checklist defines the evidence required before any Marketplace staging environment can be considered verified. It does **not** authorise resource creation, paid infrastructure, production credentials, production webhooks, DNS changes, merging, or public launch.

## 1. Environment boundary

The staging Marketplace environment must be isolated from all production and customer-commerce systems.

Required invariants:

- dedicated staging OCI service;
- dedicated staging PostgreSQL database;
- no customer-commerce Supabase credentials;
- no customer Stripe credentials;
- no legacy Marketplace database credential;
- no production GitHub App private key, OAuth secret, webhook secret, session secret, or admin token;
- no production custom domain;
- exactly one continuously running application instance for the first staging verification;
- database migrations executed separately from runtime startup.

## 2. Secret inventory — names only

The following variables are expected for the canonical Marketplace staging runtime. **Values must never be copied into this document, Git, CI logs, PR comments, issue comments, screenshots, or support tickets.**

| Variable | Classification | Required receipt |
|---|---|---|
| `DATABASE_URL` | staging database credential | provider secret reference + database resource ID |
| `DATABASE_SSL` | non-secret config | recorded value/decision |
| `DATABASE_POOL_MAX` | non-secret config | recorded value/decision |
| `PUBLIC_BASE_URL` | staging URL | deployed service URL receipt |
| `GITHUB_APP_ID` | staging/test App identifier | GitHub App ID receipt |
| `GITHUB_CLIENT_ID` | staging/test OAuth identifier | GitHub App configuration receipt |
| `GITHUB_CLIENT_SECRET` | staging secret | provider secret reference only |
| `GITHUB_WEBHOOK_SECRET` | staging secret | provider secret reference only |
| `GITHUB_PRIVATE_KEY_B64` | staging secret | provider secret reference only |
| `SESSION_SECRET` | staging secret | provider secret reference only |
| `ADMIN_TOKEN` | staging secret | provider secret reference only |

Do not install both `GITHUB_PRIVATE_KEY` and `GITHUB_PRIVATE_KEY_B64`; staging should use the base64 form unless an approved provider-specific secret format requires otherwise.

## 3. Secret quality gates

Before staging startup:

- staging/test GitHub App only;
- generated secrets must be unique to staging;
- no secret may equal a production value;
- no placeholder such as `changeme`, `example`, `test123`, or repository sample value may be used;
- secret values must be stored only in the selected provider secret manager;
- runtime logs must not print secret values;
- PR/CI output may record only secret names, provider secret-reference IDs, timestamps, and verification status;
- a rotation owner and rotation trigger must be recorded for every mutable secret.

## 4. Required staging receipts

A staging verification package is incomplete until each receipt below exists.

### RCP-STG-001 — Provider resource receipt

Record:

- provider name;
- service resource ID;
- database resource ID;
- region;
- service plan/class;
- database plan/class;
- creation timestamp;
- owner approval reference that authorised staging provisioning/spend.

Do not record database passwords or secret values.

### RCP-STG-002 — Immutable source receipt

Record:

- Git commit SHA;
- PR number;
- OCI image digest or immutable deployment revision;
- Node major version;
- `package-lock.json` integrity state;
- CI run IDs that verified the exact source.

### RCP-STG-003 — Database migration receipt

Record:

- target database resource ID;
- migration command (`npm run migrate`);
- migration start/end timestamps;
- applied migration filenames;
- success/failure status;
- operator/automation identity.

Runtime startup must not be used as the migration mechanism.

### RCP-STG-004 — Health receipt

Record:

- `/health/live` HTTP status;
- public `/health/ready` HTTP status and body;
- authenticated `/admin/health/ready` HTTP status;
- admin diagnostic component statuses **without secret values**;
- timestamp and deployment revision.

Public readiness must expose only the minimal readiness state, never named secret/component presence.

### RCP-STG-005 — GitHub webhook receipt

Record test-only evidence for:

- valid signed webhook accepted;
- invalid signature rejected;
- duplicate delivery handled idempotently;
- delivery ID;
- event type/action;
- resulting durable database record ID/status.

Never record webhook secret values.

### RCP-STG-006 — Durable job receipt

Record:

- queued job ID;
- claim timestamp;
- completion/retry/dead-letter state;
- restart test result;
- evidence that queued work survives process restart;
- evidence that one staging instance continuously claims work.

### RCP-STG-007 — OAuth/session receipt

Using a staging/test GitHub account/App configuration only, record:

- OAuth redirect/callback success;
- callback URL used;
- session creation success;
- Secure/HttpOnly/SameSite cookie attributes where HTTPS is active;
- logout/expiry behavior if exercised.

Never record OAuth access tokens, client secrets, cookies, or signed session values.

### RCP-STG-008 — Observability receipt

Record:

- deployment/revision identity visible in the provider;
- stdout/stderr capture confirmed;
- crash/restart event visibility confirmed;
- CPU/memory metrics available;
- HTTP 5xx visibility available;
- health-check failure visibility available;
- secret redaction/log review completed.

### RCP-STG-009 — Rollback receipt

Record:

- prior verified immutable image/revision;
- rollback mechanism;
- successful application rollback rehearsal;
- database rollback/restore procedure reference;
- explicit confirmation that application rollback does not imply database rollback.

The stale Vercel `richo-github-app` deployment is not an acceptable rollback target.

### RCP-STG-010 — Cost-control receipt

Record:

- monthly plan prices at approval time;
- number of service instances;
- database storage allocation;
- autoscaling state;
- HA/read-replica state;
- budget alert or manual cost-review mechanism;
- owner-approved maximum staging spend.

The default first staging shape remains one service instance, fixed database storage, no autoscaling, no HA and no read replicas.

## 5. Evidence status vocabulary

Use only these states:

- `PLANNED` — documented but not created;
- `PROVISIONED` — resource exists but verification is incomplete;
- `CONFIGURED` — configuration applied but runtime evidence incomplete;
- `VERIFIED` — direct receipt proves the control;
- `FAILED` — test/control failed;
- `BLOCKED` — required dependency or approval is unavailable;
- `RETIRED` — intentionally decommissioned with owner approval.

Never use `LIVE`, `READY`, `PRODUCTION`, or equivalent language for staging evidence unless the exact scope is explicitly qualified.

## 6. Staging exit gate

Staging can be proposed as **VERIFIED** only when:

1. RCP-STG-001 through RCP-STG-010 are complete;
2. no production credentials were used;
3. public readiness reveals no component/secret presence map;
4. admin diagnostics require `ADMIN_TOKEN`;
5. migrations were executed separately from application startup;
6. webhook signature and idempotency tests passed;
7. worker/reconciler process-lifetime behavior was directly observed;
8. rollback was rehearsed against an immutable revision;
9. cost controls were recorded;
10. owner review accepts the staging evidence package.

A verified staging environment still does **not** authorise production provisioning, production deployment, production credentials, DNS changes, Stripe live activity, Marketplace Connect, payouts, PR merge, or public launch.

# R.I.C.H.O. Marketplace Staging Execution Approval Packet

**Status:** TEMPLATE ONLY / NO EXECUTION AUTHORITY / NO PROVIDER CALLS / NO SPEND

This packet defines what must be reviewed and explicitly approved before any staging Marketplace infrastructure, secret installation, database migration, GitHub App callback/webhook mutation, or rollback drill is performed.

It does **not** approve staging. It does **not** approve production. It does **not** approve merge, DNS, live payments, Connect, payouts, or public launch.

## Approval validity law

An approval is valid only when all of the following are recorded outside committed source in an owner-controlled approval record:

- approval ID;
- approved by: Alex Richards / owner;
- approval timestamp;
- approval expiry timestamp;
- provider + region;
- exact Git commit SHA;
- exact OCI image digest produced from that SHA;
- approved staging resource scope;
- maximum approved staging spend in AUD;
- approved secret names/references, never secret values;
- approved GitHub App callback/webhook scope;
- approved migration scope;
- approved rollback-drill scope.

**Any source change after approval invalidates the source/image approval.** A new commit requires a new exact CI receipt, OCI image digest and owner approval record.

## Default state

Repository templates must remain fail-closed:

- resource creation approved: **false**
- spend approved: **false**
- spend cap: **A$0**
- secret installation approved: **false**
- database migration approved: **false**
- GitHub App callback/webhook mutation approved: **false**
- staging smoke approval: **false**
- rollback drill approved: **false**
- production promotion approved: **false**

No automation may infer approval from a successful CI run, a successful staging rehearsal, a previous owner approval, or this document.

## Immutable source gate

Immediately before any future staging action:

1. resolve the exact approved Git SHA;
2. verify PR #34 or its successor still targets the intended base;
3. verify the branch is not behind the approved base;
4. verify authoritative CI is green for the exact SHA;
5. verify the OCI image digest corresponds to that exact SHA;
6. record `RCP-STG-002`;
7. stop if any source or image identity differs.

The approval manifest intentionally contains `__SET_AFTER_FINAL_CI__` placeholders. Those placeholders may never be interpreted as approval.

## Provider/resource gate

The current staging candidate is Render in Singapore, but this remains a recommendation rather than an authorization.

Before provisioning, owner approval must specify:

- provider;
- region;
- one OCI application instance;
- one dedicated Marketplace PostgreSQL database;
- public database ingress disabled;
- auto-deploy disabled;
- scale-to-zero disabled;
- no autoscaling, HA or replicas unless separately approved;
- approved monthly or one-time spend cap in AUD.

The customer-commerce Supabase database and legacy Marketplace database are prohibited as the canonical Marketplace staging database.

## Secret-reference inventory

Only secret names/reference IDs belong in evidence. Never place values in this packet, Git, PR/issue comments, CI output, screenshots, or receipt documents.

Required staging references:

- `DATABASE_URL`
- `GITHUB_APP_ID`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_PRIVATE_KEY_B64`
- `SESSION_SECRET`
- `ADMIN_TOKEN`

The execution copy must confirm each reference resolves in the provider secret manager without printing its value.

## Exact staged activation order

The authoritative order is encoded in `staging-activation-plan.json.example` as `STG-ACT-001` through `STG-ACT-016`.

The order is deliberately dependency-aware:

1. prove exact source/image identity;
2. prove owner approval scope/expiry;
3. provision dedicated staging PostgreSQL;
4. provision the single OCI service;
5. install staging secret references;
6. capture pre-migration backup evidence;
7. run `npm run migrate` once as a separate release operation;
8. start the exact approved OCI image;
9. verify `/health/live` and minimal public `/health/ready`;
10. only then apply approved staging GitHub App callback/webhook URLs;
11. observe webhook and durable-job receipts;
12. observe OAuth/session boundary;
13. verify logs/metrics/alert visibility;
14. perform the separately approved rollback drill;
15. verify cost controls and auto-deploy remain disabled;
16. close staging rehearsal without production promotion.

Every mutating step has a named owner gate. If a gate is false or missing, that step is blocked.

## Dry-run generator

`generate-staging-dry-run.mjs` is intentionally incapable of executing the plan.

It may:

- read the local approval manifest;
- validate fail-closed state;
- print ordered `DRY-RUN ONLY` lines;
- identify which owner gate would be required;
- identify the expected receipt.

It must not:

- import `child_process`, network, DNS or TLS modules;
- call `fetch`;
- open sockets;
- invoke shell commands;
- call Render, GitHub, PostgreSQL or any provider API;
- read secret values;
- mutate files, cloud resources, GitHub App settings, databases or DNS.

The generator is a review artifact, not an executor.

## Approval record template

Keep the completed record outside Git and never include secret values.

- Approval ID: `________________`
- Owner: `Alex Richards`
- Approved at: `________________`
- Expires at: `________________`
- Provider: `________________`
- Region: `________________`
- Exact source SHA: `________________`
- Exact image digest: `________________`
- Max approved staging spend (AUD): `________________`
- Resource creation: `APPROVED / NOT APPROVED`
- Secret installation: `APPROVED / NOT APPROVED`
- Marketplace migration: `APPROVED / NOT APPROVED`
- GitHub callback/webhook mutation: `APPROVED / NOT APPROVED`
- Staging smoke: `APPROVED / NOT APPROVED`
- Rollback drill: `APPROVED / NOT APPROVED`
- Production promotion: **NOT APPROVED BY THIS PACKET**
- Notes/evidence references: `________________`

## Required closeout

A staging execution is not complete until `RCP-STG-001` through `RCP-STG-010` are either `VERIFIED` or explicitly `BLOCKED` with a reason.

Even a completely successful staging execution does not authorize:

- production provider creation;
- production database creation/migration;
- live Stripe payments;
- Stripe Connect;
- payouts;
- DNS/public launch;
- moving PR #34 out of draft;
- merging to `main`;
- retiring existing infrastructure.

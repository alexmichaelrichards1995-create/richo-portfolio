# Staging Execution Controller Skeleton

Status: **MOCK ACTIONS ONLY / LOCAL-CI DURABLE LEDGER / NO PROVIDER CALLS / NO STAGING MUTATION / NO PRODUCTION AUTHORITY**

This package models the future staging execution engine around the owner-signed authorization verifier. It still cannot provision infrastructure, modify GitHub App settings, install secrets, deploy an image, change DNS, enable payments, merge a pull request or create spend. The only durable external state added here is a PostgreSQL ledger that is hard-restricted to `NODE_ENV=test` and loopback database hosts for local/CI verification.

## Control flow

1. The controller receives a signed owner authorization record, owner public key, independently pinned owner-key fingerprint, exact repository/branch/source/image/provider/region context, requested AUD-cent spend and complete mutating action set.
2. `verifyOwnerAuthorization()` verifies signature, trust anchor, exact source/image identity, time window, spend ceiling, hard stops and action allowlist.
3. A ledger adapter claims the authorization nonce hash exactly once. The raw nonce is never stored in receipts.
4. The controller creates a **MOCK_ONLY** action session. Successful cryptographic verification never creates real-provider or production authority.
5. Each dispatched `STG-ACT-*` must be inside the signed session and map to a registered mock action adapter.
6. Each result produces a bounded non-secret receipt.
7. On mock failure, completed mock actions are compensated in reverse order and compensation receipts are recorded.
8. The session closes `SUCCEEDED` or `FAILED`. No real staging resource is touched.

## Ledger adapter contract

The controller accepts two ledger kinds only:

- `mock` — in-memory unit-test ledger;
- `local-ci-postgres` — durable PostgreSQL ledger restricted to local/CI test scope.

Required methods:

- `claimAuthorization(verification)` — atomically claim authorization ID + nonce hash and reject replay;
- `appendReceipt(receipt)` — append one receipt;
- `listReceipts(authorizationId)` — return ordered receipts;
- `closeSession(authorizationId, state)` — terminally close one execution session;
- `sessionState(authorizationId)` — read the durable session state.

The PostgreSQL implementation additionally exposes `verifyReceiptChain()`.

### Local/CI PostgreSQL law

`local-ci-postgres-ledger.mjs` is deliberately **not a staging adapter**:

- requires `NODE_ENV=test`;
- accepts only `localhost`, `127.0.0.1` or `::1` database hosts;
- uses schema `execution_ci` only;
- stores nonce hashes, never raw nonces;
- has a unique database constraint on `nonce_hash` and on `authorization_id`;
- uses a row lock (`FOR UPDATE`) to serialize receipt-chain append operations;
- maintains monotonically increasing receipt sequence and chain head;
- receipts are append-only through database triggers;
- session identity fields are immutable through database triggers;
- session close is one-way from `OPEN` to `SUCCEEDED` or `FAILED`;
- the adapter contains no provider/GitHub mutation path.

CI includes a two-process race proving that database uniqueness—not process memory—allows exactly one authorization claim winner.

A future real staging ledger must be separately designed, owner-reviewed and deployed as a durable shared service. This local/CI database is not that service and must never be treated as staging approval.

## Mock action-adapter boundary

The controller has three action adapter groups, all still mock-only:

- provider mock: `STG-ACT-003`, `004`, `005`, `008`;
- database mock: `STG-ACT-007`, `014`;
- GitHub mock: `STG-ACT-010`.

Every action adapter must declare `kind: 'mock'`. Adding a real provider, database-mutation or GitHub-mutation adapter remains a separate owner-gated design event.

## Receipt hash-chain law

Durable receipt records include:

- authorization ID and monotonic sequence;
- action ID and mock adapter name;
- state (`SUCCEEDED`, `FAILED`, `COMPENSATED`);
- timestamp;
- source SHA and OCI digest;
- nonce hash;
- bounded non-secret summary;
- execution mode `MOCK_ONLY`;
- previous receipt hash;
- current SHA-256 receipt hash.

The chain starts at 64 zeroes. Each receipt hash covers the complete canonical receipt payload plus the previous hash. `verifyReceiptChain()` recomputes every link and confirms the stored session chain head and receipt count.

Receipts must never contain raw nonce values, private keys, signatures, access tokens, provider credentials, database URLs/passwords, GitHub client secrets, webhook secrets, session secrets, admin tokens, Stripe secrets, Supabase secrets or secret values.

## Compensation law

Compensation remains **mock simulation only**. It proves orchestration order and evidence behavior; it does not authorize real rollback.

A future real adapter must separately define which compensations are safe, reversible, owner-approved and evidence-backed. Destructive database rollback, production promotion, live-money operations, DNS changes and PR merge remain outside this controller.

## Hard stops

This package must remain incapable of:

- contacting remote provider/GitHub APIs;
- connecting the execution ledger to non-loopback databases;
- running the durable ledger outside `NODE_ENV=test`;
- spawning shell/process commands from execution runtime code;
- importing provider SDKs;
- reading or installing secret values;
- writing provider or GitHub configuration;
- using live Stripe/Connect/payout paths;
- changing DNS;
- merging PR #34;
- treating CI success as owner approval.

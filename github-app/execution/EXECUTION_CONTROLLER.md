# Staging Execution Controller Skeleton

Status: **MOCK ONLY / NO PROVIDER CALLS / NO STAGING MUTATION / NO PRODUCTION AUTHORITY**

This package models the future staging execution engine around the owner-signed authorization verifier. It deliberately cannot provision infrastructure, modify GitHub App settings, contact a database, install secrets, deploy an image, change DNS, enable payments, merge a pull request, or create spend.

## Control flow

1. The controller receives a signed owner authorization record, the owner public key, an independently pinned owner-key fingerprint, exact repository/branch/source/image/provider/region context, requested AUD-cent spend, and the complete mutating action set requested for the session.
2. `verifyOwnerAuthorization()` verifies the signature, trust anchor, exact source/image identity, time window, spend ceiling, hard stops and action allowlist.
3. A ledger adapter atomically claims the authorization nonce exactly once. The nonce itself is never stored in receipts; only its SHA-256 hash is used.
4. The controller creates a **MOCK_ONLY** execution session. Successful cryptographic verification does not create production or real-provider authority.
5. Each dispatched `STG-ACT-*` must be inside the signed session action set and must map to a registered mock adapter operation.
6. Each result produces a non-secret structured receipt.
7. If a mock operation fails, already-completed mock operations are compensated in reverse order where a mock compensation exists, and compensation receipts are recorded.
8. The session closes as `SUCCEEDED` or `FAILED`. No real staging resource is touched.

## Ledger adapter contract

A future real staging implementation requires a durable, shared, atomic ledger. The controller depends only on this interface:

- `kind`: adapter identity. This skeleton accepts only `mock`.
- `claimAuthorization(verification)`: atomically claim a nonce hash and authorization ID; reject replay.
- `appendReceipt(receipt)`: append an immutable receipt record.
- `listReceipts(authorizationId)`: return receipts for one authorization.
- `closeSession(authorizationId, state)`: close the execution session.

The in-memory mock ledger is for tests only. It is **not** an acceptable real staging replay ledger.

## Mock adapter boundary

The controller has three adapter groups:

- provider mock: `STG-ACT-003`, `004`, `005`, `008`
- database mock: `STG-ACT-007`, `014`
- GitHub mock: `STG-ACT-010`

Every adapter must declare `kind: 'mock'`. Source/CI contracts reject network/process/provider SDK paths in this package.

## Receipt law

Action receipts contain only:

- schema version;
- authorization ID;
- action ID;
- mock adapter name;
- state (`SUCCEEDED`, `FAILED`, `COMPENSATED`);
- timestamp;
- source SHA and OCI digest;
- nonce hash;
- a bounded non-secret result summary.

Receipts must never contain raw nonce values, private keys, signatures, access tokens, provider credentials, database URLs/passwords, GitHub client secrets, webhook secrets, session secrets, admin tokens, Stripe secrets, Supabase secrets or secret values.

## Compensation law

Compensation in this repository is **mock simulation only**. It proves orchestration order and evidence behavior; it does not authorize or define automatic production rollback.

A future real adapter must separately define which compensations are safe, reversible, owner-approved and evidence-backed. Destructive database rollback, production promotion, live money operations, DNS changes and PR merge remain outside this controller.

## Hard stops

This skeleton must remain incapable of:

- making HTTP/TLS/DNS/socket calls;
- spawning shell/process commands;
- importing provider SDKs;
- reading or installing secret values;
- writing provider or GitHub configuration;
- using live Stripe/Connect/payout paths;
- changing DNS;
- merging PR #34;
- treating CI success as owner approval.

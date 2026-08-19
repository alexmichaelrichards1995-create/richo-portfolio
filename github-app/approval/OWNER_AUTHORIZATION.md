# Owner-Signed Staging Authorization Protocol

Status: **SOURCE CONTROL SPECIFICATION ONLY / NO CURRENT AUTHORIZATION / NO PRIVATE KEY IN REPOSITORY**

This protocol turns a future staging approval into a short-lived, replay-resistant, cryptographically verifiable capability. It does not grant staging approval by itself.

## Security properties

A valid authorization is bound to:

- repository `alexmichaelrichards1995-create/richo-portfolio`;
- branch `agent/integrate-commerce-marketplace`;
- one exact 40-character Git SHA;
- one exact OCI `sha256:` image digest;
- environment `staging` only;
- one provider and region;
- an explicit allowlist of mutating `STG-ACT-*` IDs;
- an integer maximum spend in Australian cents;
- `issued_at`, `not_before`, and `expires_at` timestamps;
- a maximum authorization lifetime of four hours;
- one cryptographically random 256-bit base64url nonce; and
- one owner Ed25519 public-key fingerprint.

Production promotion, live payments, Connect, payouts, DNS cutover, and merge remain false in every accepted staging authorization.

## Cryptographic boundary

The owner private key is an **offline owner-controlled secret**. It must never be committed to Git, stored in CI merely to automate owner approval, installed on the staging service/provider, pasted into PRs/issues/logs/screenshots/chat, or stored in the nonce ledger.

The verifier accepts an Ed25519 public key and pins it by SHA-256 of the DER-encoded SPKI public key. The signed message is the deterministic JSON emitted by `canonicalAuthorizationPayload()` in `verify-owner-authorization.mjs`.

The public key is not secret, but selecting or rotating the trusted owner public-key fingerprint is itself an owner-controlled governance action.

## Record state

`owner-authorization-record.json.example` is deliberately invalid and unsigned. A real authorization must use:

```text
status = SIGNED_OWNER_AUTHORIZATION
signature.algorithm = Ed25519
```

Editing the repository template does not create owner authorization.

## Allowed mutating action IDs

The verifier accepts only the current mutating staging actions:

- `STG-ACT-003` — provision dedicated staging PostgreSQL;
- `STG-ACT-004` — provision one staging OCI service;
- `STG-ACT-005` — install staging secret references;
- `STG-ACT-007` — apply Marketplace migrations once;
- `STG-ACT-008` — start the exact approved OCI image;
- `STG-ACT-010` — apply staging GitHub App callback/webhook URLs;
- `STG-ACT-014` — perform the approved restore/prior-image rollback drill.

An authorization may contain a subset. The execution controller must request the specific action it is about to perform. Authorization for one action never implies authorization for another.

## Exact-source invalidation

The verifier requires the execution controller to supply its current repository, branch, Git SHA, OCI digest, provider, region, requested execution spend, and required action IDs.

A mismatch fails closed. Therefore a new commit, rebuilt image digest, provider/region change, action-scope expansion, or requested spend above the owner-signed cap invalidates execution authorization.

CI success cannot extend an authorization, create a new authorization, or override an expired/replayed record.

## Spend law

`authorization.scope.max_spend_aud_cents` is the upper bound signed by the owner. The requested execution budget may never exceed the owner-signed cap. The actual requested execution budget must satisfy:

```text
0 <= requested_execution_spend_aud_cents <= owner_signed_max_spend_aud_cents
```

The existing repository staging activation template remains A$0 and all owner gates remain false. This protocol does not change that state.

## Time policy

A record must satisfy:

```text
issued_at <= not_before < expires_at
expires_at - issued_at <= 4 hours
now >= not_before
now <= expires_at
```

Use UTC RFC3339 timestamps. Shorter windows are preferred for consequential staging mutations.

## Nonce and replay policy

Each authorization requires a fresh 256-bit random base64url nonce. The verifier hashes the nonce with SHA-256 before recording consumption.

Before the first mutating action, the execution controller must atomically consume the nonce in a **durable shared authorization ledger**. The repository implementation demonstrates atomic filesystem consumption with `flag: wx`, which rejects an existing nonce receipt instead of overwriting it.

For real staging, the nonce ledger must survive process/container restarts and be shared across all possible execution workers. Ephemeral container filesystems and CI workspaces are not acceptable replay ledgers.

A nonce-consumption receipt contains only authorization ID, nonce hash, source SHA, image digest, and consumption timestamp. It does not contain the raw nonce, private key, signature key material, application secrets, or provider credentials.

## Recommended owner signing ceremony

1. Freeze the candidate branch.
2. Obtain the exact verified head SHA and exact OCI image digest from the same successful CI run.
3. Review the dry-run action list and select only the required mutating `STG-ACT-*` IDs.
4. Set an explicit maximum AUD-cent spend and a short validity window.
5. Generate a fresh 32-byte random nonce using an owner-controlled trusted environment.
6. Build the authorization payload exactly as specified by the verifier.
7. Sign the canonical payload with the offline owner Ed25519 private key.
8. Supply the signed record and corresponding approved public key to the staging execution controller through an owner-approved channel.
9. Immediately before mutation, verify exact SHA/digest/provider/region/action/spend/time/signature and atomically consume the nonce.
10. Record only non-secret verification/consumption evidence in the applicable `RCP-STG-*` receipt.

## Hard stops retained

Even a valid staging authorization cannot authorize:

- production promotion;
- live Stripe payments;
- Stripe Connect activation;
- payouts/transfers;
- production DNS cutover;
- PR merge;
- reuse of customer-commerce Supabase or the legacy Marketplace database;
- expansion beyond the exact signed action allowlist or spend cap.

Those remain separate owner-gated decisions.

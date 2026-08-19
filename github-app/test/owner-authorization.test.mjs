import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  canonicalAuthorizationPayload,
  consumeAuthorizationNonce,
  nonceHash,
  publicKeyFingerprint,
  verifyOwnerAuthorization,
} from '../approval/verify-owner-authorization.mjs'

const REPOSITORY = 'alexmichaelrichards1995-create/richo-portfolio'
const BRANCH = 'agent/integrate-commerce-marketplace'
const SOURCE_SHA = 'a'.repeat(40)
const IMAGE_DIGEST = `sha256:${'b'.repeat(64)}`
const PROVIDER = 'render'
const REGION = 'singapore'
const NOW = new Date('2026-08-19T11:30:00.000Z')

function keyMaterial() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' })
  return {
    publicKeyPem,
    privateKey,
    fingerprint: publicKeyFingerprint(publicKeyPem),
  }
}

function buildSignedRecord({
  privateKey,
  publicKeyPem,
  now = NOW,
  allowedActions = ['STG-ACT-003'],
  spendCap = 0,
  issuedOffsetMs = 0,
  notBeforeOffsetMs = 0,
  expiresOffsetMs = 60 * 60 * 1000,
} = {}) {
  const record = {
    schema_version: 1,
    status: 'SIGNED_OWNER_AUTHORIZATION',
    authorization: {
      authorization_id: 'auth-staging-0001',
      owner_key: {
        key_id: 'owner-test-key-v1',
        public_key_spki_sha256: publicKeyFingerprint(publicKeyPem),
      },
      environment: 'staging',
      repository: REPOSITORY,
      branch: BRANCH,
      provider: { name: PROVIDER, region: REGION },
      source: { git_sha: SOURCE_SHA, oci_image_digest: IMAGE_DIGEST },
      scope: {
        allowed_actions: [...allowedActions].sort(),
        max_spend_aud_cents: spendCap,
        production_promotion: false,
        live_payments: false,
        connect: false,
        payouts: false,
        dns_cutover: false,
        merge: false,
      },
      validity: {
        issued_at: new Date(now.getTime() + issuedOffsetMs).toISOString(),
        not_before: new Date(now.getTime() + notBeforeOffsetMs).toISOString(),
        expires_at: new Date(now.getTime() + expiresOffsetMs).toISOString(),
      },
      nonce: randomBytes(32).toString('base64url'),
    },
    signature: {
      algorithm: 'Ed25519',
      key_id: 'owner-test-key-v1',
      signature_b64url: '',
    },
  }
  record.signature.signature_b64url = sign(
    null,
    Buffer.from(canonicalAuthorizationPayload(record), 'utf8'),
    privateKey,
  ).toString('base64url')
  return record
}

function verify(record, keys, overrides = {}) {
  return verifyOwnerAuthorization({
    record,
    publicKeyPem: keys.publicKeyPem,
    expectedOwnerKeyFingerprint: keys.fingerprint,
    expectedRepository: REPOSITORY,
    expectedBranch: BRANCH,
    expectedSourceSha: SOURCE_SHA,
    expectedImageDigest: IMAGE_DIGEST,
    expectedProvider: PROVIDER,
    expectedRegion: REGION,
    requestedSpendAudCents: 0,
    requiredActions: ['STG-ACT-003'],
    now: NOW,
    consumedNonceHashes: new Set(),
    ...overrides,
  })
}

test('accepts valid Ed25519 owner authorization as preflight only', () => {
  const keys = keyMaterial()
  const record = buildSignedRecord({ ...keys })
  const result = verify(record, keys)
  assert.equal(result.valid, true)
  assert.equal(result.execution_authorized, false)
  assert.equal(result.preflight_only, true)
  assert.equal(result.owner_key_fingerprint, keys.fingerprint)
  assert.equal(result.source_sha, SOURCE_SHA)
  assert.equal(result.image_digest, IMAGE_DIGEST)
  assert.deepEqual(result.allowed_actions, ['STG-ACT-003'])
  assert.match(result.nonce_hash, /^[0-9a-f]{64}$/)
})

test('rejects branch/source/image/provider drift even with a valid signature', () => {
  const keys = keyMaterial()
  const record = buildSignedRecord({ ...keys })
  assert.throws(() => verify(record, keys, { expectedSourceSha: 'c'.repeat(40) }), /source SHA changed/)
  assert.throws(() => verify(record, keys, { expectedImageDigest: `sha256:${'d'.repeat(64)}` }), /OCI image digest changed/)
  assert.throws(() => verify(record, keys, { expectedBranch: 'main' }), /branch does not match/)
  assert.throws(() => verify(record, keys, { expectedProvider: 'fly' }), /provider scope mismatch/)
  assert.throws(() => verify(record, keys, { expectedRegion: 'oregon' }), /region mismatch/)
})

test('rejects action scope escalation and spend above the owner-signed cap', () => {
  const keys = keyMaterial()
  const record = buildSignedRecord({ ...keys })
  assert.throws(() => verify(record, keys, { requiredActions: ['STG-ACT-007'] }), /outside owner authorization scope/)
  assert.throws(() => verify(record, keys, { requestedSpendAudCents: 1 }), /exceeds owner-signed spend cap/)

  const capped = buildSignedRecord({ ...keys, spendCap: 500 })
  assert.equal(verify(capped, keys, { requestedSpendAudCents: 500 }).valid, true)
  assert.throws(() => verify(capped, keys, { requestedSpendAudCents: 501 }), /exceeds owner-signed spend cap/)
})

test('rejects expired, not-yet-active, and overlong authorizations', () => {
  const keys = keyMaterial()
  const expired = buildSignedRecord({ ...keys, issuedOffsetMs: -2 * 60 * 60 * 1000, notBeforeOffsetMs: -2 * 60 * 60 * 1000, expiresOffsetMs: -1000 })
  assert.throws(() => verify(expired, keys), /expired/)

  const future = buildSignedRecord({ ...keys, issuedOffsetMs: 60 * 1000, notBeforeOffsetMs: 60 * 1000, expiresOffsetMs: 2 * 60 * 60 * 1000 })
  assert.throws(() => verify(future, keys), /not active yet/)

  const overlong = buildSignedRecord({ ...keys, expiresOffsetMs: (4 * 60 * 60 + 1) * 1000 })
  assert.throws(() => verify(overlong, keys), /lifetime may not exceed/)
})

test('rejects payload tampering, wrong key, and attacker-controlled replacement trust root', () => {
  const owner = keyMaterial()
  const record = buildSignedRecord({ ...owner })
  const tampered = structuredClone(record)
  tampered.authorization.provider.region = 'oregon'
  assert.throws(() => verify(tampered, owner, { expectedRegion: 'oregon' }), /signature verification failed/)

  const attacker = keyMaterial()
  assert.throws(() => verify(record, attacker, { expectedOwnerKeyFingerprint: owner.fingerprint }), /does not match externally pinned trust anchor/)

  const attackerRecord = buildSignedRecord({ ...attacker })
  assert.throws(
    () => verifyOwnerAuthorization({
      record: attackerRecord,
      publicKeyPem: attacker.publicKeyPem,
      expectedOwnerKeyFingerprint: owner.fingerprint,
      expectedRepository: REPOSITORY,
      expectedBranch: BRANCH,
      expectedSourceSha: SOURCE_SHA,
      expectedImageDigest: IMAGE_DIGEST,
      expectedProvider: PROVIDER,
      expectedRegion: REGION,
      requestedSpendAudCents: 0,
      requiredActions: ['STG-ACT-003'],
      now: NOW,
      consumedNonceHashes: new Set(),
    }),
    /externally pinned trust anchor/,
  )
})

test('rejects consumed nonce hashes and atomically prevents replay without storing raw nonce', async () => {
  const keys = keyMaterial()
  const record = buildSignedRecord({ ...keys })
  const hash = nonceHash(record.authorization.nonce)
  assert.throws(() => verify(record, keys, { consumedNonceHashes: new Set([hash]) }), /already been consumed/)

  const verification = verify(record, keys)
  const ledgerDir = await mkdtemp(join(tmpdir(), 'richo-owner-auth-'))
  try {
    const first = await consumeAuthorizationNonce({ ledgerDir, verification, consumedAt: NOW })
    assert.match(first, new RegExp(`${hash}\\.json$`))
    const receipt = await readFile(first, 'utf8')
    assert.match(receipt, new RegExp(hash))
    assert.doesNotMatch(receipt, new RegExp(record.authorization.nonce))
    await assert.rejects(
      consumeAuthorizationNonce({ ledgerDir, verification, consumedAt: NOW }),
      /nonce replay detected/,
    )
  } finally {
    await rm(ledgerDir, { recursive: true, force: true })
  }
})

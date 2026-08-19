import assert from 'node:assert/strict'
import {
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
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

function keyMaterial() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey,
  }
}

function buildSignedRecord({
  privateKey,
  publicKeyPem,
  now = new Date('2026-08-19T11:30:00.000Z'),
  allowedActions = ['STG-ACT-003'],
  spendCap = 0,
  issuedOffsetMs = 0,
  notBeforeOffsetMs = 0,
  expiresOffsetMs = 60 * 60 * 1000,
} = {}) {
  const issuedAt = new Date(now.getTime() + issuedOffsetMs)
  const notBefore = new Date(now.getTime() + notBeforeOffsetMs)
  const expiresAt = new Date(now.getTime() + expiresOffsetMs)
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
        issued_at: issuedAt.toISOString(),
        not_before: notBefore.toISOString(),
        expires_at: expiresAt.toISOString(),
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

function verify(record, publicKeyPem, overrides = {}) {
  return verifyOwnerAuthorization({
    record,
    publicKeyPem,
    expectedRepository: REPOSITORY,
    expectedBranch: BRANCH,
    expectedSourceSha: SOURCE_SHA,
    expectedImageDigest: IMAGE_DIGEST,
    expectedProvider: PROVIDER,
    expectedRegion: REGION,
    executionSpendCapAudCents: 0,
    requiredActions: ['STG-ACT-003'],
    now: new Date('2026-08-19T11:30:00.000Z'),
    consumedNonceHashes: new Set(),
    ...overrides,
  })
}

test('accepts a valid Ed25519 owner authorization bound to exact staging source and scope', () => {
  const keys = keyMaterial()
  const record = buildSignedRecord({ ...keys })
  const result = verify(record, keys.publicKeyPem)
  assert.equal(result.valid, true)
  assert.equal(result.source_sha, SOURCE_SHA)
  assert.equal(result.image_digest, IMAGE_DIGEST)
  assert.deepEqual(result.allowed_actions, ['STG-ACT-003'])
  assert.match(result.nonce_hash, /^[0-9a-f]{64}$/)
})

test('rejects branch/source/image drift even when the signature itself is valid', () => {
  const keys = keyMaterial()
  const record = buildSignedRecord({ ...keys })
  assert.throws(() => verify(record, keys.publicKeyPem, { expectedSourceSha: 'c'.repeat(40) }), /source SHA changed/)
  assert.throws(() => verify(record, keys.publicKeyPem, { expectedImageDigest: `sha256:${'d'.repeat(64)}` }), /OCI image digest changed/)
  assert.throws(() => verify(record, keys.publicKeyPem, { expectedBranch: 'main' }), /branch does not match/)
})

test('rejects authorization scope escalation and spend beyond the execution cap', () => {
  const keys = keyMaterial()
  const record = buildSignedRecord({ ...keys })
  assert.throws(() => verify(record, keys.publicKeyPem, { requiredActions: ['STG-ACT-007'] }), /outside owner authorization scope/)

  const spendRecord = buildSignedRecord({ ...keys, spendCap: 500 })
  assert.throws(() => verify(spendRecord, keys.publicKeyPem), /spend cap exceeds/)
})

test('rejects expired, not-yet-active, and overlong authorizations', () => {
  const keys = keyMaterial()
  const expired = buildSignedRecord({ ...keys, issuedOffsetMs: -2 * 60 * 60 * 1000, notBeforeOffsetMs: -2 * 60 * 60 * 1000, expiresOffsetMs: -1000 })
  assert.throws(() => verify(expired, keys.publicKeyPem), /expired/)

  const future = buildSignedRecord({ ...keys, issuedOffsetMs: 60 * 1000, notBeforeOffsetMs: 60 * 1000, expiresOffsetMs: 2 * 60 * 60 * 1000 })
  assert.throws(() => verify(future, keys.publicKeyPem), /not active yet/)

  const overlong = buildSignedRecord({ ...keys, expiresOffsetMs: (4 * 60 * 60 + 1) * 1000 })
  assert.throws(() => verify(overlong, keys.publicKeyPem), /lifetime may not exceed/)
})

test('rejects payload tampering and the wrong owner public key', () => {
  const keys = keyMaterial()
  const record = buildSignedRecord({ ...keys })
  const tampered = structuredClone(record)
  tampered.authorization.provider.region = 'oregon'
  assert.throws(() => verify(tampered, keys.publicKeyPem, { expectedRegion: 'oregon' }), /signature verification failed/)

  const otherKeys = keyMaterial()
  assert.throws(() => verify(record, otherKeys.publicKeyPem), /public key fingerprint mismatch/)
})

test('rejects consumed nonce hashes and atomically prevents nonce replay', async () => {
  const keys = keyMaterial()
  const record = buildSignedRecord({ ...keys })
  const hash = nonceHash(record.authorization.nonce)
  assert.throws(() => verify(record, keys.publicKeyPem, { consumedNonceHashes: new Set([hash]) }), /already been consumed/)

  const verification = verify(record, keys.publicKeyPem)
  const ledgerDir = await mkdtemp(join(tmpdir(), 'richo-owner-auth-'))
  try {
    const first = await consumeAuthorizationNonce({ ledgerDir, verification })
    assert.match(first, new RegExp(`${hash}\\.json$`))
    await assert.rejects(
      consumeAuthorizationNonce({ ledgerDir, verification }),
      /nonce replay detected/,
    )
  } finally {
    await rm(ledgerDir, { recursive: true, force: true })
  }
})

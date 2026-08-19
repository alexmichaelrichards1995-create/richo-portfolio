import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import test from 'node:test'
import {
  canonicalAuthorizationPayload,
  publicKeyFingerprint,
} from '../approval/verify-owner-authorization.mjs'
import { createMockExecutionController } from '../execution/mock-execution-controller.mjs'
import { createMockExecutionAdapters } from '../execution/mock-adapters.mjs'
import { createMockLedger } from '../execution/mock-ledger.mjs'

const NOW = new Date('2026-08-19T12:30:00.000Z')
const REPOSITORY = 'alexmichaelrichards1995-create/richo-portfolio'
const BRANCH = 'agent/integrate-commerce-marketplace'
const SOURCE_SHA = '1'.repeat(40)
const IMAGE_DIGEST = `sha256:${'2'.repeat(64)}`
const PROVIDER = 'render'
const REGION = 'singapore'

function keyMaterial() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey,
  }
}

function buildSignedRecord({ publicKeyPem, privateKey, allowedActions, spendCap = 0, nonce } = {}) {
  const fingerprint = publicKeyFingerprint(publicKeyPem)
  const record = {
    schema_version: 1,
    status: 'SIGNED_OWNER_AUTHORIZATION',
    authorization: {
      authorization_id: `auth-mock-${randomBytes(8).toString('hex')}`,
      owner_key: { key_id: 'owner-test-key-v1', public_key_spki_sha256: fingerprint },
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
        issued_at: NOW.toISOString(),
        not_before: NOW.toISOString(),
        expires_at: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
      },
      nonce: nonce ?? randomBytes(32).toString('base64url'),
    },
    signature: { algorithm: 'Ed25519', key_id: 'owner-test-key-v1', signature_b64url: '' },
  }
  record.signature.signature_b64url = sign(
    null,
    Buffer.from(canonicalAuthorizationPayload(record), 'utf8'),
    privateKey,
  ).toString('base64url')
  return record
}

function beginArgs(record, publicKeyPem, requestedActions, overrides = {}) {
  return {
    record,
    publicKeyPem,
    expectedOwnerKeyFingerprint: publicKeyFingerprint(publicKeyPem),
    expectedRepository: REPOSITORY,
    expectedBranch: BRANCH,
    expectedSourceSha: SOURCE_SHA,
    expectedImageDigest: IMAGE_DIGEST,
    expectedProvider: PROVIDER,
    expectedRegion: REGION,
    requestedSpendAudCents: 0,
    requestedActions,
    now: NOW,
    ...overrides,
  }
}

function controller({ ledger = createMockLedger(), adapters = createMockExecutionAdapters() } = {}) {
  return {
    ledger,
    adapters,
    controller: createMockExecutionController({ ledger, adapters, clock: () => NOW }),
  }
}

test('runs a signed multi-action mock session and emits non-secret receipts', async () => {
  const keys = keyMaterial()
  const actions = ['STG-ACT-003', 'STG-ACT-004', 'STG-ACT-005']
  const record = buildSignedRecord({ ...keys, allowedActions: actions })
  const rawNonce = record.authorization.nonce
  const system = controller()

  const session = await system.controller.begin(beginArgs(record, keys.publicKeyPem, actions))
  assert.equal(session.execution_mode, 'MOCK_ONLY')
  assert.equal(session.real_execution_authorized, false)

  const result = await system.controller.runAll(session)
  assert.equal(result.state, 'SUCCEEDED')
  assert.equal(result.action_receipts.length, 3)
  assert.equal(await system.ledger.sessionState(record.authorization.authorization_id), 'SUCCEEDED')

  const receipts = await system.ledger.listReceipts(record.authorization.authorization_id)
  assert.deepEqual(receipts.map((item) => item.state), ['SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED'])
  const serialized = JSON.stringify(receipts)
  assert.equal(serialized.includes(rawNonce), false)
  assert.equal(serialized.includes(record.signature.signature_b64url), false)
  assert.doesNotMatch(serialized, /sk_live_|ghp_|github_pat_|postgresql:\/\//)
})

test('claims one nonce once and rejects replayed authorization sessions', async () => {
  const keys = keyMaterial()
  const actions = ['STG-ACT-003']
  const record = buildSignedRecord({ ...keys, allowedActions: actions })
  const system = controller()

  await system.controller.begin(beginArgs(record, keys.publicKeyPem, actions))
  await assert.rejects(
    system.controller.begin(beginArgs(record, keys.publicKeyPem, actions)),
    /replay detected|duplicate authorization session/i,
  )
})

test('rejects scope escalation and non-canonical action ordering before adapter execution', async () => {
  const keys = keyMaterial()
  const record = buildSignedRecord({ ...keys, allowedActions: ['STG-ACT-003'] })
  const system = controller()

  await assert.rejects(
    system.controller.begin(beginArgs(record, keys.publicKeyPem, ['STG-ACT-004'])),
    /outside owner authorization scope/,
  )

  const orderedRecord = buildSignedRecord({ ...keys, allowedActions: ['STG-ACT-003', 'STG-ACT-004'] })
  await assert.rejects(
    system.controller.begin(beginArgs(orderedRecord, keys.publicKeyPem, ['STG-ACT-004', 'STG-ACT-003'])),
    /canonical staging mutation order/,
  )
  assert.equal(system.adapters.provider.events.length, 0)
})

test('rejects any non-mock adapter at controller construction', () => {
  const adapters = createMockExecutionAdapters()
  assert.throws(() => createMockExecutionController({
    ledger: createMockLedger(),
    adapters: { ...adapters, provider: { ...adapters.provider, kind: 'real' } },
  }), /must be mock-only/)
})

test('compensates completed mock actions in reverse order after deterministic failure', async () => {
  const keys = keyMaterial()
  const actions = ['STG-ACT-003', 'STG-ACT-004', 'STG-ACT-005']
  const record = buildSignedRecord({ ...keys, allowedActions: actions })
  const adapters = createMockExecutionAdapters({ provider: { failOn: ['STG-ACT-005'] } })
  const system = controller({ adapters })
  const session = await system.controller.begin(beginArgs(record, keys.publicKeyPem, actions))

  await assert.rejects(system.controller.runAll(session), /MOCK_EXECUTION_FAILED/)
  assert.deepEqual(adapters.provider.events, [
    { type: 'execute', action_id: 'STG-ACT-003' },
    { type: 'execute', action_id: 'STG-ACT-004' },
    { type: 'execute', action_id: 'STG-ACT-005' },
    { type: 'compensate', action_id: 'STG-ACT-004' },
    { type: 'compensate', action_id: 'STG-ACT-003' },
  ])

  const receipts = await system.ledger.listReceipts(record.authorization.authorization_id)
  assert.deepEqual(receipts.map((item) => [item.action_id, item.state]), [
    ['STG-ACT-003', 'SUCCEEDED'],
    ['STG-ACT-004', 'SUCCEEDED'],
    ['STG-ACT-005', 'FAILED'],
    ['STG-ACT-004', 'COMPENSATED'],
    ['STG-ACT-003', 'COMPENSATED'],
  ])
  assert.equal(await system.ledger.sessionState(record.authorization.authorization_id), 'FAILED')
})

test('rejects dispatch outside the signed session and duplicate dispatch', async () => {
  const keys = keyMaterial()
  const actions = ['STG-ACT-003']
  const record = buildSignedRecord({ ...keys, allowedActions: actions })
  const system = controller()
  const session = await system.controller.begin(beginArgs(record, keys.publicKeyPem, actions))

  await assert.rejects(system.controller.dispatch(session, 'STG-ACT-004'), /outside the signed mock execution session/)
  await system.controller.dispatch(session, 'STG-ACT-003')
  await assert.rejects(system.controller.dispatch(session, 'STG-ACT-003'), /already been dispatched/)
})

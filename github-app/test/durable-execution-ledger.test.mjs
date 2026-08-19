import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import test, { beforeEach } from 'node:test'
import pg from 'pg'
import {
  canonicalAuthorizationPayload,
  publicKeyFingerprint,
} from '../approval/verify-owner-authorization.mjs'
import { createMockExecutionController } from '../execution/mock-execution-controller.mjs'
import { createMockExecutionAdapters } from '../execution/mock-adapters.mjs'
import {
  createLocalCiPostgresLedger,
  resetLocalCiLedgerSchemaForTests,
  validateLocalCiLedgerDatabaseUrl,
} from '../execution/local-ci-postgres-ledger.mjs'

const { Pool } = pg
const DATABASE_URL = process.env.DATABASE_URL ?? ''
const NOW = new Date('2026-08-19T13:00:00.000Z')
const REPOSITORY = 'alexmichaelrichards1995-create/richo-portfolio'
const BRANCH = 'agent/integrate-commerce-marketplace'
const SOURCE_SHA = '3'.repeat(40)
const IMAGE_DIGEST = `sha256:${'4'.repeat(64)}`
const PROVIDER = 'render'
const REGION = 'singapore'

let durableAvailable = false
try {
  validateLocalCiLedgerDatabaseUrl(DATABASE_URL, process.env.NODE_ENV)
  durableAvailable = true
} catch {
  durableAvailable = false
}

beforeEach(async () => {
  if (durableAvailable) await resetLocalCiLedgerSchemaForTests({ databaseUrl: DATABASE_URL, nodeEnv: 'test' })
})

function verification(overrides = {}) {
  return {
    valid: true,
    execution_authorized: false,
    preflight_only: true,
    authorization_id: `auth-durable-${randomBytes(8).toString('hex')}`,
    source_sha: SOURCE_SHA,
    image_digest: IMAGE_DIGEST,
    provider: PROVIDER,
    region: REGION,
    requested_spend_aud_cents: 0,
    nonce_hash: randomBytes(32).toString('hex'),
    ...overrides,
  }
}

function keyMaterial() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey,
  }
}

function buildSignedRecord({ publicKeyPem, privateKey, allowedActions }) {
  const fingerprint = publicKeyFingerprint(publicKeyPem)
  const record = {
    schema_version: 1,
    status: 'SIGNED_OWNER_AUTHORIZATION',
    authorization: {
      authorization_id: `auth-durable-controller-${randomBytes(8).toString('hex')}`,
      owner_key: { key_id: 'owner-test-key-v1', public_key_spki_sha256: fingerprint },
      environment: 'staging',
      repository: REPOSITORY,
      branch: BRANCH,
      provider: { name: PROVIDER, region: REGION },
      source: { git_sha: SOURCE_SHA, oci_image_digest: IMAGE_DIGEST },
      scope: {
        allowed_actions: [...allowedActions].sort(),
        max_spend_aud_cents: 0,
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
      nonce: randomBytes(32).toString('base64url'),
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

function beginArgs(record, publicKeyPem, requestedActions) {
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
  }
}

function receiptFor(v, actionId, summary) {
  return {
    schema_version: 1,
    authorization_id: v.authorization_id,
    action_id: actionId,
    adapter: 'mock-provider',
    state: 'SUCCEEDED',
    timestamp: NOW.toISOString(),
    source_sha: v.source_sha,
    image_digest: v.image_digest,
    nonce_hash: v.nonce_hash,
    summary,
    execution_mode: 'MOCK_ONLY',
  }
}

function runRaceWorker(v) {
  const workerPath = fileURLToPath(new URL('./fixtures/durable-ledger-race-worker.mjs', import.meta.url))
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL,
        LEDGER_VERIFICATION_JSON: JSON.stringify(v),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (code) => resolve({ code, stdout, stderr }))
  })
}

test('local/CI PostgreSQL ledger rejects remote databases and non-test execution', () => {
  assert.throws(
    () => createLocalCiPostgresLedger({ databaseUrl: 'postgresql://user:pass@example.com/db', nodeEnv: 'test' }),
    /loopback database hosts only/,
  )
  assert.throws(
    () => createLocalCiPostgresLedger({ databaseUrl: 'postgresql://user:pass@127.0.0.1/db', nodeEnv: 'production' }),
    /restricted to NODE_ENV=test/,
  )
})

test('durable ledger persists signed mock execution receipts with a valid SHA-256 chain', { skip: !durableAvailable }, async () => {
  const keys = keyMaterial()
  const actions = ['STG-ACT-003', 'STG-ACT-004', 'STG-ACT-005']
  const record = buildSignedRecord({ ...keys, allowedActions: actions })
  const ledger = createLocalCiPostgresLedger({ databaseUrl: DATABASE_URL, nodeEnv: 'test' })
  const controller = createMockExecutionController({
    ledger,
    adapters: createMockExecutionAdapters(),
    clock: () => NOW,
  })

  try {
    const session = await controller.begin(beginArgs(record, keys.publicKeyPem, actions))
    assert.equal(session.ledger_kind, 'local-ci-postgres')
    const result = await controller.runAll(session)
    assert.equal(result.state, 'SUCCEEDED')
    assert.equal(result.ledger_kind, 'local-ci-postgres')

    const chain = await ledger.verifyReceiptChain(record.authorization.authorization_id)
    assert.equal(chain.valid, true)
    assert.equal(chain.count, 3)
    assert.match(chain.head_hash, /^[0-9a-f]{64}$/)

    const secondProcessView = createLocalCiPostgresLedger({ databaseUrl: DATABASE_URL, nodeEnv: 'test' })
    try {
      assert.equal(await secondProcessView.sessionState(record.authorization.authorization_id), 'SUCCEEDED')
      const receipts = await secondProcessView.listReceipts(record.authorization.authorization_id)
      assert.deepEqual(receipts.map((item) => item.sequence), [1, 2, 3])
      assert.deepEqual(receipts.map((item) => item.prev_receipt_hash), ['0'.repeat(64), receipts[0].receipt_hash, receipts[1].receipt_hash])
      assert.equal(JSON.stringify(receipts).includes(record.authorization.nonce), false)
    } finally {
      await secondProcessView.close()
    }
  } finally {
    await ledger.close()
  }
})

test('database uniqueness allows exactly one winner when two separate Node processes claim the same nonce', { skip: !durableAvailable }, async () => {
  const v = verification({ authorization_id: 'auth-cross-process-race-fixed', nonce_hash: 'a'.repeat(64) })
  const results = await Promise.all([runRaceWorker(v), runRaceWorker(v)])
  assert.deepEqual(results.map((item) => item.code).sort(), [0, 2])
  assert.equal(results.filter((item) => /CLAIMED/.test(item.stdout)).length, 1)
  assert.equal(results.filter((item) => /REPLAY_REJECTED/.test(item.stdout)).length, 1)
  assert.equal(results.every((item) => item.stderr === ''), true)
})

test('independent ledger instances serialize concurrent receipt appends into one valid chain', { skip: !durableAvailable }, async () => {
  const v = verification()
  const ledgerA = createLocalCiPostgresLedger({ databaseUrl: DATABASE_URL, nodeEnv: 'test' })
  const ledgerB = createLocalCiPostgresLedger({ databaseUrl: DATABASE_URL, nodeEnv: 'test' })
  try {
    await ledgerA.claimAuthorization(v)
    await Promise.all([
      ledgerA.appendReceipt(receiptFor(v, 'STG-ACT-003', 'mock concurrent receipt A')),
      ledgerB.appendReceipt(receiptFor(v, 'STG-ACT-004', 'mock concurrent receipt B')),
    ])
    const receipts = await ledgerA.listReceipts(v.authorization_id)
    assert.deepEqual(receipts.map((item) => item.sequence), [1, 2])
    assert.equal(receipts[1].prev_receipt_hash, receipts[0].receipt_hash)
    assert.deepEqual(await ledgerA.verifyReceiptChain(v.authorization_id), {
      valid: true,
      count: 2,
      head_hash: receipts[1].receipt_hash,
    })
  } finally {
    await ledgerA.close()
    await ledgerB.close()
  }
})

test('database triggers reject receipt edits, receipt deletion and session identity mutation', { skip: !durableAvailable }, async () => {
  const v = verification()
  const ledger = createLocalCiPostgresLedger({ databaseUrl: DATABASE_URL, nodeEnv: 'test' })
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 })
  try {
    await ledger.claimAuthorization(v)
    await ledger.appendReceipt(receiptFor(v, 'STG-ACT-003', 'immutable mock receipt'))

    await assert.rejects(
      pool.query("UPDATE execution_ci.execution_receipts SET summary = 'tampered' WHERE authorization_id = $1", [v.authorization_id]),
      /immutable append-only records/,
    )
    await assert.rejects(
      pool.query('DELETE FROM execution_ci.execution_receipts WHERE authorization_id = $1', [v.authorization_id]),
      /immutable append-only records/,
    )
    await assert.rejects(
      pool.query("UPDATE execution_ci.authorization_sessions SET source_sha = $2 WHERE authorization_id = $1", [v.authorization_id, 'f'.repeat(40)]),
      /session identity is immutable/,
    )
    await assert.rejects(
      pool.query('DELETE FROM execution_ci.authorization_sessions WHERE authorization_id = $1', [v.authorization_id]),
      /append-only records/,
    )
  } finally {
    await pool.end()
    await ledger.close()
  }
})

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const { Pool } = pg
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const ZERO_HASH = '0'.repeat(64)
const RECEIPT_STATES = new Set(['SUCCEEDED', 'FAILED', 'COMPENSATED'])
const SESSION_STATES = new Set(['SUCCEEDED', 'FAILED'])

function assertHex(value, length, field) {
  assert.equal(typeof value, 'string', `${field} must be a string`)
  assert.match(value, new RegExp(`^[0-9a-f]{${length}}$`), `${field} must be ${length}-character lowercase hex`)
}

export function validateLocalCiLedgerDatabaseUrl(databaseUrl, nodeEnv = process.env.NODE_ENV) {
  assert.equal(nodeEnv, 'test', 'PostgreSQL execution ledger is restricted to NODE_ENV=test')
  assert.equal(typeof databaseUrl, 'string', 'databaseUrl is required')
  const url = new URL(databaseUrl)
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'databaseUrl must use PostgreSQL')
  assert.ok(LOOPBACK_HOSTS.has(url.hostname), 'PostgreSQL execution ledger accepts loopback database hosts only')
  assert.ok(url.pathname && url.pathname !== '/', 'databaseUrl must identify a database')
  return url
}

export function canonicalReceiptPayload(receipt) {
  return JSON.stringify({
    schema_version: 1,
    authorization_id: receipt.authorization_id,
    sequence: receipt.sequence,
    action_id: receipt.action_id,
    adapter: receipt.adapter,
    state: receipt.state,
    timestamp: receipt.timestamp,
    source_sha: receipt.source_sha,
    image_digest: receipt.image_digest,
    nonce_hash: receipt.nonce_hash,
    summary: receipt.summary,
    execution_mode: receipt.execution_mode,
    prev_receipt_hash: receipt.prev_receipt_hash,
  })
}

export function receiptHash(receipt) {
  return createHash('sha256').update(canonicalReceiptPayload(receipt), 'utf8').digest('hex')
}

function normalizeReceiptRow(row) {
  return Object.freeze({
    schema_version: 1,
    authorization_id: row.authorization_id,
    sequence: Number(row.sequence),
    action_id: row.action_id,
    adapter: row.adapter,
    state: row.state,
    timestamp: new Date(row.occurred_at).toISOString(),
    source_sha: row.source_sha,
    image_digest: row.image_digest,
    nonce_hash: row.nonce_hash,
    summary: row.summary,
    execution_mode: row.execution_mode,
    prev_receipt_hash: row.prev_receipt_hash,
    receipt_hash: row.receipt_hash,
  })
}

export function createLocalCiPostgresLedger({ databaseUrl, nodeEnv = process.env.NODE_ENV, pool } = {}) {
  validateLocalCiLedgerDatabaseUrl(databaseUrl, nodeEnv)
  const ownedPool = !pool
  const db = pool ?? new Pool({ connectionString: databaseUrl, max: 4 })

  async function claimAuthorization(verification) {
    assert.equal(verification?.valid, true, 'verification must be valid')
    assert.equal(verification.preflight_only, true, 'verification must be preflight-only before durable claim')
    assert.equal(verification.execution_authorized, false, 'verification must not already claim execution authority')
    assertHex(verification.nonce_hash, 64, 'nonce_hash')
    assertHex(verification.source_sha, 40, 'source_sha')
    assert.match(verification.image_digest, /^sha256:[0-9a-f]{64}$/, 'image_digest must be exact sha256 digest')

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `INSERT INTO execution_ci.authorization_sessions
          (authorization_id, nonce_hash, source_sha, image_digest, provider, region, requested_spend_aud_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING authorization_id, nonce_hash, source_sha, image_digest, state, opened_at`,
        [
          verification.authorization_id,
          verification.nonce_hash,
          verification.source_sha,
          verification.image_digest,
          verification.provider,
          verification.region,
          verification.requested_spend_aud_cents,
        ],
      )
      await client.query('COMMIT')
      const row = result.rows[0]
      return Object.freeze({
        schema_version: 1,
        authorization_id: row.authorization_id,
        nonce_hash: row.nonce_hash,
        source_sha: row.source_sha,
        image_digest: row.image_digest,
        state: row.state,
        claimed_at: new Date(row.opened_at).toISOString(),
        ledger_kind: 'local-ci-postgres',
      })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      if (error?.code === '23505') {
        throw new Error('Durable ledger replay or duplicate authorization session detected')
      }
      throw error
    } finally {
      client.release()
    }
  }

  async function appendReceipt(receipt) {
    assert.ok(receipt && typeof receipt === 'object', 'receipt is required')
    assert.ok(RECEIPT_STATES.has(receipt.state), 'receipt state is invalid')
    assert.equal(receipt.execution_mode, 'MOCK_ONLY', 'durable local/CI ledger accepts MOCK_ONLY receipts only')
    assert.equal(typeof receipt.summary, 'string', 'receipt summary must be a string')
    assert.ok(receipt.summary.length >= 1 && receipt.summary.length <= 240, 'receipt summary length is invalid')

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const sessionResult = await client.query(
        `SELECT authorization_id, nonce_hash, source_sha, image_digest, state, receipt_count, last_receipt_hash
           FROM execution_ci.authorization_sessions
          WHERE authorization_id = $1
          FOR UPDATE`,
        [receipt.authorization_id],
      )
      assert.equal(sessionResult.rowCount, 1, 'authorization session must be durably claimed before receipt append')
      const session = sessionResult.rows[0]
      assert.equal(session.state, 'OPEN', 'authorization session must be OPEN for receipt append')
      assert.equal(receipt.nonce_hash, session.nonce_hash, 'receipt nonce_hash does not match durable session')
      assert.equal(receipt.source_sha, session.source_sha, 'receipt source_sha does not match durable session')
      assert.equal(receipt.image_digest, session.image_digest, 'receipt image_digest does not match durable session')

      const sequence = Number(session.receipt_count) + 1
      const prevReceiptHash = session.last_receipt_hash || ZERO_HASH
      const chained = {
        ...receipt,
        sequence,
        prev_receipt_hash: prevReceiptHash,
      }
      const hash = receiptHash(chained)

      await client.query(
        `INSERT INTO execution_ci.execution_receipts
          (authorization_id, sequence, action_id, adapter, state, occurred_at, source_sha, image_digest,
           nonce_hash, summary, execution_mode, prev_receipt_hash, receipt_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          chained.authorization_id,
          sequence,
          chained.action_id,
          chained.adapter,
          chained.state,
          chained.timestamp,
          chained.source_sha,
          chained.image_digest,
          chained.nonce_hash,
          chained.summary,
          chained.execution_mode,
          prevReceiptHash,
          hash,
        ],
      )
      await client.query(
        `UPDATE execution_ci.authorization_sessions
            SET receipt_count = $2, last_receipt_hash = $3
          WHERE authorization_id = $1`,
        [receipt.authorization_id, sequence, hash],
      )
      await client.query('COMMIT')
      return Object.freeze({ ...chained, receipt_hash: hash })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  async function listReceipts(authorizationId) {
    const result = await db.query(
      `SELECT authorization_id, sequence, action_id, adapter, state, occurred_at, source_sha, image_digest,
              nonce_hash, summary, execution_mode, prev_receipt_hash, receipt_hash
         FROM execution_ci.execution_receipts
        WHERE authorization_id = $1
        ORDER BY sequence ASC`,
      [authorizationId],
    )
    return result.rows.map(normalizeReceiptRow)
  }

  async function verifyReceiptChain(authorizationId) {
    const receipts = await listReceipts(authorizationId)
    let previous = ZERO_HASH
    for (let index = 0; index < receipts.length; index += 1) {
      const receipt = receipts[index]
      assert.equal(receipt.sequence, index + 1, 'durable receipt sequence gap detected')
      assert.equal(receipt.prev_receipt_hash, previous, 'durable receipt previous-hash mismatch')
      assert.equal(receipt.receipt_hash, receiptHash(receipt), 'durable receipt hash mismatch')
      previous = receipt.receipt_hash
    }

    const session = await db.query(
      `SELECT receipt_count, last_receipt_hash FROM execution_ci.authorization_sessions WHERE authorization_id = $1`,
      [authorizationId],
    )
    assert.equal(session.rowCount, 1, 'authorization session not found for receipt-chain verification')
    assert.equal(Number(session.rows[0].receipt_count), receipts.length, 'session receipt_count does not match durable receipt chain')
    assert.equal(session.rows[0].last_receipt_hash, previous, 'session last_receipt_hash does not match durable receipt chain head')

    return Object.freeze({ valid: true, count: receipts.length, head_hash: previous })
  }

  async function closeSession(authorizationId, state, closedAt = new Date()) {
    assert.ok(SESSION_STATES.has(state), 'session close state must be SUCCEEDED or FAILED')
    const result = await db.query(
      `UPDATE execution_ci.authorization_sessions
          SET state = $2, closed_at = $3
        WHERE authorization_id = $1 AND state = 'OPEN'
      RETURNING authorization_id, state, closed_at`,
      [authorizationId, state, closedAt.toISOString()],
    )
    assert.equal(result.rowCount, 1, 'durable authorization session missing or already closed')
    return Object.freeze({
      authorization_id: result.rows[0].authorization_id,
      state: result.rows[0].state,
      closed_at: new Date(result.rows[0].closed_at).toISOString(),
    })
  }

  async function sessionState(authorizationId) {
    const result = await db.query(
      'SELECT state FROM execution_ci.authorization_sessions WHERE authorization_id = $1',
      [authorizationId],
    )
    return result.rows[0]?.state ?? null
  }

  async function close() {
    if (ownedPool) await db.end()
  }

  return Object.freeze({
    kind: 'local-ci-postgres',
    execution_scope: 'local-ci-only',
    claimAuthorization,
    appendReceipt,
    listReceipts,
    verifyReceiptChain,
    closeSession,
    sessionState,
    close,
  })
}

export async function resetLocalCiLedgerSchemaForTests({ databaseUrl, nodeEnv = process.env.NODE_ENV } = {}) {
  validateLocalCiLedgerDatabaseUrl(databaseUrl, nodeEnv)
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  try {
    await pool.query('DROP SCHEMA IF EXISTS execution_ci CASCADE')
    const sql = await readFile(new URL('./sql/001_local_ci_durable_ledger.sql', import.meta.url), 'utf8')
    await pool.query(sql)
  } finally {
    await pool.end()
  }
}

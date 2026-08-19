import assert from 'node:assert/strict'
import { KNOWN_MUTATING_ACTIONS, verifyOwnerAuthorization } from '../approval/verify-owner-authorization.mjs'
import { assertExecutionLedgerAdapter, assertMockExecutionAdapters } from './ledger-contract.mjs'
import { MOCK_ACTION_ROUTING } from './mock-adapters.mjs'

const ACTION_ORDER = Object.freeze([...KNOWN_MUTATING_ACTIONS])
const RECEIPT_STATES = Object.freeze(['SUCCEEDED', 'FAILED', 'COMPENSATED'])
const FORBIDDEN_SUMMARY_PATTERNS = [
  /sk_(?:live|test)_/i,
  /rk_(?:live|test)_/i,
  /ghp_[A-Za-z0-9]/,
  /github_pat_[A-Za-z0-9]/,
  /postgres(?:ql)?:\/\//i,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i,
]

function assertRequestedActions(actions) {
  assert.ok(Array.isArray(actions) && actions.length > 0, 'requestedActions must contain at least one mutating staging action')
  assert.equal(new Set(actions).size, actions.length, 'requestedActions must not contain duplicates')
  for (const action of actions) assert.ok(ACTION_ORDER.includes(action), `Unsupported staging action: ${action}`)
  const sorted = [...actions].sort((a, b) => ACTION_ORDER.indexOf(a) - ACTION_ORDER.indexOf(b))
  assert.deepEqual(actions, sorted, 'requestedActions must follow canonical staging mutation order')
}

function safeSummary(value) {
  assert.equal(typeof value, 'string', 'adapter result summary must be a string')
  assert.ok(value.length > 0 && value.length <= 240, 'adapter result summary must be 1..240 characters')
  for (const pattern of FORBIDDEN_SUMMARY_PATTERNS) {
    assert.doesNotMatch(value, pattern, 'adapter result summary contains credential-like material')
  }
  return value
}

function createReceipt({ session, actionId, adapterName, state, summary, timestamp }) {
  assert.ok(RECEIPT_STATES.includes(state), `unsupported receipt state: ${state}`)
  return Object.freeze({
    schema_version: 1,
    authorization_id: session.authorization_id,
    action_id: actionId,
    adapter: adapterName,
    state,
    timestamp,
    source_sha: session.source_sha,
    image_digest: session.image_digest,
    nonce_hash: session.nonce_hash,
    summary: safeSummary(summary),
    execution_mode: 'MOCK_ONLY',
  })
}

export function createMockExecutionController({ ledger, adapters, clock = () => new Date() }) {
  assertExecutionLedgerAdapter(ledger)
  assertMockExecutionAdapters(adapters)
  assert.equal(typeof clock, 'function', 'clock must be a function')

  async function begin({
    record,
    publicKeyPem,
    expectedOwnerKeyFingerprint,
    expectedRepository,
    expectedBranch,
    expectedSourceSha,
    expectedImageDigest,
    expectedProvider,
    expectedRegion,
    requestedSpendAudCents,
    requestedActions,
    now = clock(),
  }) {
    assertRequestedActions(requestedActions)

    const verification = verifyOwnerAuthorization({
      record,
      publicKeyPem,
      expectedOwnerKeyFingerprint,
      expectedRepository,
      expectedBranch,
      expectedSourceSha,
      expectedImageDigest,
      expectedProvider,
      expectedRegion,
      requestedSpendAudCents,
      requiredActions: requestedActions,
      now,
      consumedNonceHashes: new Set(),
    })

    assert.equal(verification.execution_authorized, false)
    assert.equal(verification.preflight_only, true)
    await ledger.claimAuthorization(verification)

    return {
      schema_version: 1,
      execution_mode: 'MOCK_ONLY',
      real_execution_authorized: false,
      ledger_kind: ledger.kind,
      state: 'OPEN',
      authorization_id: verification.authorization_id,
      source_sha: verification.source_sha,
      image_digest: verification.image_digest,
      nonce_hash: verification.nonce_hash,
      provider: verification.provider,
      region: verification.region,
      requested_spend_aud_cents: verification.requested_spend_aud_cents,
      requested_actions: Object.freeze([...requestedActions]),
      completed_actions: [],
      dispatched_actions: new Set(),
    }
  }

  async function dispatch(session, actionId) {
    assert.equal(session.execution_mode, 'MOCK_ONLY', 'session must be mock-only')
    assert.equal(session.real_execution_authorized, false, 'mock session must never claim real execution authority')
    assert.equal(session.state, 'OPEN', 'session must be open')
    assert.ok(session.requested_actions.includes(actionId), `${actionId} is outside the signed mock execution session`)
    assert.equal(session.dispatched_actions.has(actionId), false, `${actionId} has already been dispatched`)

    const group = MOCK_ACTION_ROUTING[actionId]
    assert.ok(group, `No mock action route for ${actionId}`)
    const adapter = adapters[group]
    assert.equal(adapter.kind, 'mock', 'real adapters are forbidden in the mock execution controller')
    session.dispatched_actions.add(actionId)

    const context = Object.freeze({
      execution_mode: 'MOCK_ONLY',
      authorization_id: session.authorization_id,
      source_sha: session.source_sha,
      image_digest: session.image_digest,
      provider: session.provider,
      region: session.region,
    })

    try {
      const result = await adapter.execute(actionId, context)
      assert.equal(result?.mock, true, 'adapter must return an explicit mock result')
      const receipt = createReceipt({
        session,
        actionId,
        adapterName: adapter.name,
        state: 'SUCCEEDED',
        summary: result.summary,
        timestamp: clock().toISOString(),
      })
      await ledger.appendReceipt(receipt)
      session.completed_actions.push(actionId)
      return receipt
    } catch (error) {
      const receipt = createReceipt({
        session,
        actionId,
        adapterName: adapter.name,
        state: 'FAILED',
        summary: `mock action failed: ${error.message}`.slice(0, 240),
        timestamp: clock().toISOString(),
      })
      await ledger.appendReceipt(receipt)
      throw error
    }
  }

  async function compensateCompleted(session) {
    const receipts = []
    for (const actionId of [...session.completed_actions].reverse()) {
      const group = MOCK_ACTION_ROUTING[actionId]
      const adapter = adapters[group]
      const result = await adapter.compensate(actionId, Object.freeze({
        execution_mode: 'MOCK_ONLY',
        authorization_id: session.authorization_id,
        source_sha: session.source_sha,
        image_digest: session.image_digest,
      }))
      assert.equal(result?.mock, true, 'compensation adapter must return an explicit mock result')
      const receipt = createReceipt({
        session,
        actionId,
        adapterName: adapter.name,
        state: 'COMPENSATED',
        summary: result.summary,
        timestamp: clock().toISOString(),
      })
      await ledger.appendReceipt(receipt)
      receipts.push(receipt)
    }
    return receipts
  }

  async function runAll(session) {
    assert.equal(session.state, 'OPEN', 'session must be open')
    try {
      const actionReceipts = []
      for (const actionId of session.requested_actions) actionReceipts.push(await dispatch(session, actionId))
      session.state = 'SUCCEEDED'
      await ledger.closeSession(session.authorization_id, 'SUCCEEDED', clock())
      return Object.freeze({
        state: 'SUCCEEDED',
        execution_mode: 'MOCK_ONLY',
        ledger_kind: ledger.kind,
        action_receipts: actionReceipts,
        compensation_receipts: [],
      })
    } catch (error) {
      const compensationReceipts = await compensateCompleted(session)
      session.state = 'FAILED'
      await ledger.closeSession(session.authorization_id, 'FAILED', clock())
      const wrapped = new Error(`MOCK_EXECUTION_FAILED: ${error.message}`)
      wrapped.cause = error
      wrapped.compensation_receipts = compensationReceipts
      throw wrapped
    }
  }

  return Object.freeze({
    kind: 'mock-controller',
    begin,
    dispatch,
    runAll,
  })
}

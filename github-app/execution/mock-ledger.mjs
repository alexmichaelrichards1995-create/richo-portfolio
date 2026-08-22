import assert from 'node:assert/strict'

export function createMockLedger() {
  const nonceClaims = new Map()
  const receipts = new Map()
  const sessions = new Map()

  function receiptList(authorizationId) {
    if (!receipts.has(authorizationId)) receipts.set(authorizationId, [])
    return receipts.get(authorizationId)
  }

  return Object.freeze({
    kind: 'mock',

    async claimAuthorization(verification) {
      assert.equal(verification.valid, true, 'verification must be valid')
      assert.equal(verification.preflight_only, true, 'verification must be preflight-only before ledger claim')
      assert.equal(verification.execution_authorized, false, 'verification must not already claim execution authority')
      assert.match(verification.nonce_hash, /^[0-9a-f]{64}$/)

      if (nonceClaims.has(verification.nonce_hash)) {
        throw new Error('Mock ledger replay detected: authorization nonce hash already claimed')
      }
      if (sessions.has(verification.authorization_id)) {
        throw new Error('Mock ledger duplicate authorization session detected')
      }

      const claim = Object.freeze({
        schema_version: 1,
        authorization_id: verification.authorization_id,
        nonce_hash: verification.nonce_hash,
        source_sha: verification.source_sha,
        image_digest: verification.image_digest,
        state: 'CLAIMED',
      })
      nonceClaims.set(verification.nonce_hash, claim)
      sessions.set(verification.authorization_id, { state: 'OPEN' })
      return claim
    },

    async appendReceipt(receipt) {
      assert.ok(receipt && typeof receipt === 'object', 'receipt is required')
      assert.ok(sessions.has(receipt.authorization_id), 'authorization session must be claimed before receipt append')
      const frozen = Object.freeze(structuredClone(receipt))
      receiptList(receipt.authorization_id).push(frozen)
      return frozen
    },

    async listReceipts(authorizationId) {
      return receiptList(authorizationId).map((item) => structuredClone(item))
    },

    async closeSession(authorizationId, state) {
      assert.ok(['SUCCEEDED', 'FAILED'].includes(state), 'session close state must be SUCCEEDED or FAILED')
      const session = sessions.get(authorizationId)
      assert.ok(session, 'authorization session must exist')
      if (session.state !== 'OPEN') throw new Error('Mock ledger session already closed')
      session.state = state
      return Object.freeze({ authorization_id: authorizationId, state })
    },

    async sessionState(authorizationId) {
      return sessions.get(authorizationId)?.state ?? null
    },
  })
}

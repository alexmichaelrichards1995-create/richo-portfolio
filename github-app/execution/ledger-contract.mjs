import assert from 'node:assert/strict'

const REQUIRED_LEDGER_METHODS = Object.freeze([
  'claimAuthorization',
  'appendReceipt',
  'listReceipts',
  'closeSession',
  'sessionState',
])

const ALLOWED_LEDGER_KINDS = new Set(['mock', 'local-ci-postgres'])

export function assertExecutionLedgerAdapter(ledger) {
  assert.ok(ledger && typeof ledger === 'object', 'ledger adapter is required')
  assert.ok(ALLOWED_LEDGER_KINDS.has(ledger.kind), 'Execution controller accepts mock or local-CI PostgreSQL ledgers only')
  for (const method of REQUIRED_LEDGER_METHODS) {
    assert.equal(typeof ledger[method], 'function', `ledger.${method} must be a function`)
  }
  if (ledger.kind === 'local-ci-postgres') {
    assert.equal(ledger.execution_scope, 'local-ci-only', 'PostgreSQL execution ledger must be restricted to local/CI scope')
    assert.equal(typeof ledger.verifyReceiptChain, 'function', 'local-CI PostgreSQL ledger must expose receipt-chain verification')
  }
  return ledger
}

export function assertMockLedgerAdapter(ledger) {
  assertExecutionLedgerAdapter(ledger)
  assert.equal(ledger.kind, 'mock', 'Mock ledger assertion requires kind=mock')
  return ledger
}

export function assertMockExecutionAdapters(adapters) {
  assert.ok(adapters && typeof adapters === 'object', 'execution adapters are required')
  for (const group of ['provider', 'database', 'github']) {
    const adapter = adapters[group]
    assert.ok(adapter && typeof adapter === 'object', `${group} adapter is required`)
    assert.equal(adapter.kind, 'mock', `${group} adapter must be mock-only`)
    assert.equal(typeof adapter.execute, 'function', `${group}.execute must be a function`)
    assert.equal(typeof adapter.compensate, 'function', `${group}.compensate must be a function`)
  }
  return adapters
}

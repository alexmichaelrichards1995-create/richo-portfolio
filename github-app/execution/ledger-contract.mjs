import assert from 'node:assert/strict'

const REQUIRED_LEDGER_METHODS = Object.freeze([
  'claimAuthorization',
  'appendReceipt',
  'listReceipts',
  'closeSession',
])

export function assertMockLedgerAdapter(ledger) {
  assert.ok(ledger && typeof ledger === 'object', 'ledger adapter is required')
  assert.equal(ledger.kind, 'mock', 'Execution controller accepts mock ledger adapters only')
  for (const method of REQUIRED_LEDGER_METHODS) {
    assert.equal(typeof ledger[method], 'function', `ledger.${method} must be a function`)
  }
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

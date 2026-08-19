import assert from 'node:assert/strict'

const PROVIDER_ACTIONS = new Map([
  ['STG-ACT-003', 'mock staging PostgreSQL provisioned'],
  ['STG-ACT-004', 'mock single-instance OCI service provisioned'],
  ['STG-ACT-005', 'mock secret references installed without values'],
  ['STG-ACT-008', 'mock exact OCI image started'],
])

const DATABASE_ACTIONS = new Map([
  ['STG-ACT-007', 'mock Marketplace migrations applied once'],
  ['STG-ACT-014', 'mock restore and prior-image rollback drill completed'],
])

const GITHUB_ACTIONS = new Map([
  ['STG-ACT-010', 'mock GitHub App callback and webhook endpoints updated'],
])

function createAdapter(name, supported, { failOn = [] } = {}) {
  const failures = new Set(failOn)
  const events = []

  function requireSupported(actionId) {
    assert.ok(supported.has(actionId), `${name} adapter does not support ${actionId}`)
  }

  return Object.freeze({
    kind: 'mock',
    name,
    events,
    supportedActions: Object.freeze([...supported.keys()]),

    async execute(actionId, context) {
      requireSupported(actionId)
      assert.equal(context.execution_mode, 'MOCK_ONLY')
      events.push({ type: 'execute', action_id: actionId })
      if (failures.has(actionId)) throw new Error(`${name} injected mock failure for ${actionId}`)
      return Object.freeze({
        summary: supported.get(actionId),
        mock: true,
      })
    },

    async compensate(actionId, context) {
      requireSupported(actionId)
      assert.equal(context.execution_mode, 'MOCK_ONLY')
      events.push({ type: 'compensate', action_id: actionId })
      return Object.freeze({
        summary: `mock compensation completed for ${actionId}`,
        mock: true,
      })
    },
  })
}

export function createMockExecutionAdapters(options = {}) {
  return Object.freeze({
    provider: createAdapter('mock-provider', PROVIDER_ACTIONS, options.provider),
    database: createAdapter('mock-database', DATABASE_ACTIONS, options.database),
    github: createAdapter('mock-github', GITHUB_ACTIONS, options.github),
  })
}

export const MOCK_ACTION_ROUTING = Object.freeze({
  'STG-ACT-003': 'provider',
  'STG-ACT-004': 'provider',
  'STG-ACT-005': 'provider',
  'STG-ACT-007': 'database',
  'STG-ACT-008': 'provider',
  'STG-ACT-010': 'github',
  'STG-ACT-014': 'database',
})

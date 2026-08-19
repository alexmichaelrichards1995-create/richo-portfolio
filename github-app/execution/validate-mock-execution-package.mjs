#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { KNOWN_MUTATING_ACTIONS } from '../approval/verify-owner-authorization.mjs'
import { MOCK_ACTION_ROUTING, createMockExecutionAdapters } from './mock-adapters.mjs'
import { createMockLedger } from './mock-ledger.mjs'

async function text(name) {
  return readFile(new URL(name, import.meta.url), 'utf8')
}

const controller = await text('mock-execution-controller.mjs')
const adapters = await text('mock-adapters.mjs')
const ledger = await text('mock-ledger.mjs')
const contract = await text('ledger-contract.mjs')
const docs = await text('EXECUTION_CONTROLLER.md')
const allCode = `${controller}\n${adapters}\n${ledger}\n${contract}`

assert.match(docs, /MOCK ONLY \/ NO PROVIDER CALLS \/ NO STAGING MUTATION \/ NO PRODUCTION AUTHORITY/)
assert.match(docs, /durable, shared, atomic ledger/i)
assert.match(docs, /Every adapter must declare `kind: 'mock'`/)
assert.match(docs, /compensation.*mock simulation only/is)
assert.match(docs, /CI success as owner approval/i)

assert.deepEqual(Object.keys(MOCK_ACTION_ROUTING), [...KNOWN_MUTATING_ACTIONS])
const mockAdapters = createMockExecutionAdapters()
assert.equal(mockAdapters.provider.kind, 'mock')
assert.equal(mockAdapters.database.kind, 'mock')
assert.equal(mockAdapters.github.kind, 'mock')
assert.equal(createMockLedger().kind, 'mock')

assert.match(controller, /execution_mode: 'MOCK_ONLY'/)
assert.match(controller, /real_execution_authorized: false/)
assert.match(controller, /verifyOwnerAuthorization/)
assert.match(controller, /claimAuthorization/)
assert.match(controller, /compensateCompleted/)
assert.match(controller, /COMPENSATED/)
assert.match(ledger, /replay detected/i)
assert.match(contract, /accepts mock ledger adapters only/i)
assert.match(contract, /adapter must be mock-only/i)

assert.doesNotMatch(allCode, /node:child_process|child_process|spawn\(|exec\(|execFile\(|fork\(/)
assert.doesNotMatch(allCode, /node:https|node:http|node:net|node:dns|node:tls/)
assert.doesNotMatch(allCode, /\bfetch\s*\(|\bcurl\b|\bwget\b/)
assert.doesNotMatch(allCode, /api\.render\.com|api\.github\.com|railway\.app|fly\.io\/api/i)
assert.doesNotMatch(allCode, /@aws-sdk|@google-cloud|azure-sdk|render-sdk|railway-sdk|flyctl/i)
assert.doesNotMatch(allCode, /sk_live_|rk_live_|ghp_[A-Za-z0-9]|github_pat_[A-Za-z0-9]/)
assert.doesNotMatch(allCode, /postgresql:\/\/[^\s"']+:[^\s"']+@/i)
assert.doesNotMatch(allCode, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/)

console.log('Mock staging execution controller package validated')

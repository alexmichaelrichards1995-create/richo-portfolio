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
const mockLedger = await text('mock-ledger.mjs')
const durableLedger = await text('local-ci-postgres-ledger.mjs')
const durableSql = await text('sql/001_local_ci_durable_ledger.sql')
const contract = await text('ledger-contract.mjs')
const docs = await text('EXECUTION_CONTROLLER.md')
const runtimeCode = `${controller}\n${adapters}\n${mockLedger}\n${durableLedger}\n${contract}`

assert.match(docs, /MOCK ACTIONS ONLY \/ LOCAL-CI DURABLE LEDGER \/ NO PROVIDER CALLS \/ NO STAGING MUTATION \/ NO PRODUCTION AUTHORITY/)
assert.match(docs, /database uniqueness.*exactly one authorization claim winner/is)
assert.match(docs, /Every action adapter must declare `kind: 'mock'`/)
assert.match(docs, /Receipt hash-chain law/)
assert.match(docs, /compensation remains \*\*mock simulation only\*\*/i)
assert.match(docs, /treating CI success as owner approval/i)

assert.deepEqual(Object.keys(MOCK_ACTION_ROUTING), [...KNOWN_MUTATING_ACTIONS])
const mockAdapters = createMockExecutionAdapters()
assert.equal(mockAdapters.provider.kind, 'mock')
assert.equal(mockAdapters.database.kind, 'mock')
assert.equal(mockAdapters.github.kind, 'mock')
assert.equal(createMockLedger().kind, 'mock')

assert.match(controller, /execution_mode: 'MOCK_ONLY'/)
assert.match(controller, /real_execution_authorized: false/)
assert.match(controller, /assertExecutionLedgerAdapter/)
assert.match(controller, /verifyOwnerAuthorization/)
assert.match(controller, /claimAuthorization/)
assert.match(controller, /compensateCompleted/)
assert.match(controller, /COMPENSATED/)
assert.match(mockLedger, /replay detected/i)
assert.match(contract, /mock or local-CI PostgreSQL ledgers only/)
assert.match(contract, /adapter must be mock-only/i)
assert.match(contract, /local-ci-postgres/)

assert.match(durableLedger, /restricted to NODE_ENV=test/)
assert.match(durableLedger, /loopback database hosts only/)
assert.match(durableLedger, /kind: 'local-ci-postgres'/)
assert.match(durableLedger, /execution_scope: 'local-ci-only'/)
assert.match(durableLedger, /FOR UPDATE/)
assert.match(durableLedger, /verifyReceiptChain/)
assert.match(durableLedger, /receiptHash/)
assert.match(durableLedger, /Durable ledger replay or duplicate authorization session detected/)
assert.match(durableSql, /nonce_hash char\(64\) NOT NULL UNIQUE/)
assert.match(durableSql, /execution receipts are immutable append-only records/)
assert.match(durableSql, /session identity is immutable/)
assert.match(durableSql, /state IN \('OPEN', 'SUCCEEDED', 'FAILED'\)/)

assert.doesNotMatch(runtimeCode, /node:child_process|child_process|spawn\(|exec\(|execFile\(|fork\(/)
assert.doesNotMatch(runtimeCode, /node:https|node:http|node:dns|node:tls/)
assert.doesNotMatch(runtimeCode, /\bfetch\s*\(|\bcurl\b|\bwget\b/)
assert.doesNotMatch(runtimeCode, /api\.render\.com|api\.github\.com|railway\.app|fly\.io\/api/i)
assert.doesNotMatch(runtimeCode, /@aws-sdk|@google-cloud|azure-sdk|render-sdk|railway-sdk|flyctl/i)
assert.doesNotMatch(runtimeCode, /sk_live_|rk_live_|ghp_[A-Za-z0-9]|github_pat_[A-Za-z0-9]/)
assert.doesNotMatch(runtimeCode, /postgresql:\/\/[^\s"']+:[^\s"']+@/i)
assert.doesNotMatch(runtimeCode, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/)

console.log('Mock staging execution controller + local-CI durable ledger package validated')

#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'

const allowedStates = new Set(['PLANNED','PROVISIONED','CONFIGURED','VERIFIED','FAILED','BLOCKED','RETIRED'])
const envName = process.env.RICHO_ENVIRONMENT || ''
const baseUrl = process.env.PUBLIC_BASE_URL || ''
const adminToken = process.env.ADMIN_TOKEN || ''

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (envName !== 'staging') fail('RICHO_ENVIRONMENT must equal staging')
if (!/^https:\/\//.test(baseUrl)) fail('PUBLIC_BASE_URL must be an https staging URL')
if (/prod|production/i.test(baseUrl)) fail('PUBLIC_BASE_URL appears production-like; refusing rehearsal')

const requiredNames = [
  'DATABASE_URL','GITHUB_APP_ID','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET',
  'GITHUB_WEBHOOK_SECRET','GITHUB_PRIVATE_KEY_B64','SESSION_SECRET','ADMIN_TOKEN'
]

const secretPresence = Object.fromEntries(requiredNames.map((name) => [name, Boolean(process.env[name])]))
const missing = requiredNames.filter((name) => !secretPresence[name])

async function jsonFetch(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: 'manual',
    ...options,
  })
  let body = null
  const text = await response.text()
  try { body = text ? JSON.parse(text) : null } catch { body = { non_json: true } }
  return { status: response.status, body }
}

const migrationFiles = (await readdir(new URL('../sql/', import.meta.url)))
  .filter((name) => name.endsWith('.sql'))
  .sort()
const migrationInventory = []
for (const name of migrationFiles) {
  const bytes = await readFile(new URL(`../sql/${name}`, import.meta.url))
  migrationInventory.push({ name, sha256: createHash('sha256').update(bytes).digest('hex') })
}

const evidence = {
  generated_at: new Date().toISOString(),
  status: 'PLANNED',
  environment: envName,
  public_base_url: baseUrl,
  secret_presence: secretPresence,
  missing_secret_names: missing,
  migrations: migrationInventory,
  health: null,
  admin_readiness: null,
  note: 'No secret values are recorded by this collector.'
}

try {
  const live = await jsonFetch('/health/live')
  const ready = await jsonFetch('/health/ready')
  evidence.health = { live_status: live.status, live_body: live.body, ready_status: ready.status, ready_body: ready.body }

  if (adminToken) {
    const admin = await jsonFetch('/admin/health/ready', { headers: { 'x-admin-token': adminToken } })
    evidence.admin_readiness = { status: admin.status, body: admin.body }
  }

  const publicReadyKeys = evidence.health?.ready_body && typeof evidence.health.ready_body === 'object'
    ? Object.keys(evidence.health.ready_body)
    : []
  if (publicReadyKeys.some((key) => key !== 'ok')) fail('Public readiness exposed fields other than ok')

  const serialized = JSON.stringify(evidence)
  for (const name of ['GITHUB_CLIENT_SECRET','GITHUB_WEBHOOK_SECRET','GITHUB_PRIVATE_KEY_B64','SESSION_SECRET','ADMIN_TOKEN']) {
    const value = process.env[name]
    if (value && serialized.includes(value)) fail(`Collector leaked secret value: ${name}`)
  }

  if (evidence.health.live_status === 200 && publicReadyKeys.length === 1 && publicReadyKeys[0] === 'ok') {
    evidence.status = evidence.health.ready_status === 200 ? 'VERIFIED' : 'CONFIGURED'
  } else {
    evidence.status = 'FAILED'
  }
} catch (error) {
  evidence.status = 'FAILED'
  evidence.collection_error = String(error?.message || error)
}

if (!allowedStates.has(evidence.status)) fail('Invalid evidence state')

const output = process.argv[2] || 'staging-evidence.json'
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 })
console.log(`Wrote redacted staging evidence to ${output}`)

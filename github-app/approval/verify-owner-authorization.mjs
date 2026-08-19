#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from 'node:crypto'
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const MAX_AUTH_TTL_SECONDS = 4 * 60 * 60
export const KNOWN_MUTATING_ACTIONS = Object.freeze([
  'STG-ACT-003',
  'STG-ACT-004',
  'STG-ACT-005',
  'STG-ACT-007',
  'STG-ACT-008',
  'STG-ACT-010',
  'STG-ACT-014',
])

const SHA40 = /^[0-9a-f]{40}$/
const OCI_DIGEST = /^sha256:[0-9a-f]{64}$/
const SHA256_HEX = /^[0-9a-f]{64}$/
const BASE64URL_256 = /^[A-Za-z0-9_-]{43,128}$/

function requireRfc3339Utc(value, field) {
  assert.equal(typeof value, 'string', `${field} must be a string`)
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/, `${field} must be RFC3339 UTC`)
  const ms = Date.parse(value)
  assert.ok(Number.isFinite(ms), `${field} must parse as a timestamp`)
  return ms
}

function stableScope(scope) {
  return {
    allowed_actions: [...scope.allowed_actions].sort(),
    max_spend_aud_cents: scope.max_spend_aud_cents,
    production_promotion: scope.production_promotion,
    live_payments: scope.live_payments,
    connect: scope.connect,
    payouts: scope.payouts,
    dns_cutover: scope.dns_cutover,
    merge: scope.merge,
  }
}

export function canonicalAuthorizationPayload(record) {
  const a = record.authorization
  const canonical = {
    schema_version: record.schema_version,
    authorization_id: a.authorization_id,
    owner_key: {
      key_id: a.owner_key.key_id,
      public_key_spki_sha256: a.owner_key.public_key_spki_sha256,
    },
    environment: a.environment,
    repository: a.repository,
    branch: a.branch,
    provider: {
      name: a.provider.name,
      region: a.provider.region,
    },
    source: {
      git_sha: a.source.git_sha,
      oci_image_digest: a.source.oci_image_digest,
    },
    scope: stableScope(a.scope),
    validity: {
      issued_at: a.validity.issued_at,
      not_before: a.validity.not_before,
      expires_at: a.validity.expires_at,
    },
    nonce: a.nonce,
  }
  return JSON.stringify(canonical)
}

export function publicKeyFingerprint(publicKeyPem) {
  const key = createPublicKey(publicKeyPem)
  const der = key.export({ type: 'spki', format: 'der' })
  return createHash('sha256').update(der).digest('hex')
}

export function nonceHash(nonce) {
  return createHash('sha256').update(nonce, 'utf8').digest('hex')
}

function validateStructure(record) {
  assert.equal(record.schema_version, 1, 'Unsupported authorization schema version')
  assert.equal(record.status, 'SIGNED_OWNER_AUTHORIZATION', 'Record must be an explicitly signed owner authorization')
  const a = record.authorization
  assert.ok(a && typeof a === 'object', 'authorization object is required')
  assert.match(a.authorization_id, /^[A-Za-z0-9._:-]{12,128}$/, 'authorization_id format invalid')
  assert.match(a.owner_key.key_id, /^[A-Za-z0-9._:-]{3,128}$/, 'key_id format invalid')
  assert.match(a.owner_key.public_key_spki_sha256, SHA256_HEX, 'public key fingerprint must be SHA-256 hex')
  assert.equal(a.environment, 'staging', 'Only staging authorizations are accepted')
  assert.match(a.source.git_sha, SHA40, 'git_sha must be exact 40-character lowercase hex')
  assert.match(a.source.oci_image_digest, OCI_DIGEST, 'OCI digest must be exact sha256 digest')
  assert.ok(Array.isArray(a.scope.allowed_actions), 'allowed_actions must be an array')
  assert.ok(a.scope.allowed_actions.length > 0, 'At least one mutating staging action must be explicitly authorized')
  assert.deepEqual(a.scope.allowed_actions, [...a.scope.allowed_actions].sort(), 'allowed_actions must be sorted')
  assert.equal(new Set(a.scope.allowed_actions).size, a.scope.allowed_actions.length, 'allowed_actions must not contain duplicates')
  for (const action of a.scope.allowed_actions) {
    assert.ok(KNOWN_MUTATING_ACTIONS.includes(action), `Unknown or non-mutating action in authorization scope: ${action}`)
  }
  assert.ok(Number.isSafeInteger(a.scope.max_spend_aud_cents) && a.scope.max_spend_aud_cents >= 0, 'max_spend_aud_cents must be a non-negative integer')
  for (const stop of ['production_promotion', 'live_payments', 'connect', 'payouts', 'dns_cutover', 'merge']) {
    assert.equal(a.scope[stop], false, `${stop} must remain false in a staging authorization`)
  }
  assert.match(a.nonce, BASE64URL_256, 'nonce must be at least 256-bit base64url data')
  assert.equal(record.signature.algorithm, 'Ed25519', 'Only Ed25519 signatures are accepted')
  assert.equal(record.signature.key_id, a.owner_key.key_id, 'signature key_id must match authorization owner key')
  assert.match(record.signature.signature_b64url, /^[A-Za-z0-9_-]{80,128}$/, 'signature_b64url format invalid')
}

export function verifyOwnerAuthorization({
  record,
  publicKeyPem,
  expectedRepository,
  expectedBranch,
  expectedSourceSha,
  expectedImageDigest,
  expectedProvider,
  expectedRegion,
  executionSpendCapAudCents,
  requiredActions = [],
  now = new Date(),
  consumedNonceHashes = new Set(),
}) {
  validateStructure(record)
  const a = record.authorization

  assert.equal(a.repository, expectedRepository, 'Authorization repository does not match execution repository')
  assert.equal(a.branch, expectedBranch, 'Authorization branch does not match execution branch')
  assert.equal(a.source.git_sha, expectedSourceSha, 'Authorization invalid: source SHA changed')
  assert.equal(a.source.oci_image_digest, expectedImageDigest, 'Authorization invalid: OCI image digest changed')
  assert.equal(a.provider.name, expectedProvider, 'Authorization provider scope mismatch')
  assert.equal(a.provider.region, expectedRegion, 'Authorization provider region mismatch')
  assert.ok(Number.isSafeInteger(executionSpendCapAudCents) && executionSpendCapAudCents >= 0, 'executionSpendCapAudCents must be a non-negative integer')
  assert.ok(a.scope.max_spend_aud_cents <= executionSpendCapAudCents, 'Authorization spend cap exceeds execution-approved spend cap')

  for (const requiredAction of requiredActions) {
    assert.ok(KNOWN_MUTATING_ACTIONS.includes(requiredAction), `Required action is not a known mutating staging action: ${requiredAction}`)
    assert.ok(a.scope.allowed_actions.includes(requiredAction), `Required action is outside owner authorization scope: ${requiredAction}`)
  }

  const issuedAt = requireRfc3339Utc(a.validity.issued_at, 'issued_at')
  const notBefore = requireRfc3339Utc(a.validity.not_before, 'not_before')
  const expiresAt = requireRfc3339Utc(a.validity.expires_at, 'expires_at')
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now)
  assert.ok(Number.isFinite(nowMs), 'now must be a valid timestamp')
  assert.ok(issuedAt <= notBefore, 'not_before cannot precede issued_at')
  assert.ok(notBefore < expiresAt, 'expires_at must be after not_before')
  assert.ok(expiresAt - issuedAt <= MAX_AUTH_TTL_SECONDS * 1000, `Authorization lifetime may not exceed ${MAX_AUTH_TTL_SECONDS} seconds`)
  assert.ok(nowMs >= notBefore, 'Authorization is not active yet')
  assert.ok(nowMs <= expiresAt, 'Authorization has expired')

  const fingerprint = publicKeyFingerprint(publicKeyPem)
  assert.equal(fingerprint, a.owner_key.public_key_spki_sha256, 'Owner public key fingerprint mismatch')
  const payload = canonicalAuthorizationPayload(record)
  const signature = Buffer.from(record.signature.signature_b64url, 'base64url')
  assert.equal(verifySignature(null, Buffer.from(payload, 'utf8'), publicKeyPem, signature), true, 'Owner Ed25519 signature verification failed')

  const hash = nonceHash(a.nonce)
  assert.equal(consumedNonceHashes.has(hash), false, 'Authorization nonce has already been consumed')

  return {
    valid: true,
    authorization_id: a.authorization_id,
    key_id: a.owner_key.key_id,
    source_sha: a.source.git_sha,
    image_digest: a.source.oci_image_digest,
    provider: a.provider.name,
    region: a.provider.region,
    allowed_actions: [...a.scope.allowed_actions],
    max_spend_aud_cents: a.scope.max_spend_aud_cents,
    expires_at: a.validity.expires_at,
    nonce_hash: hash,
  }
}

async function nonceConsumed(ledgerDir, hash) {
  try {
    await stat(join(ledgerDir, `${hash}.json`))
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export async function consumeAuthorizationNonce({ ledgerDir, verification, consumedAt = new Date() }) {
  assert.ok(ledgerDir, 'ledgerDir is required for nonce consumption')
  await mkdir(ledgerDir, { recursive: true, mode: 0o700 })
  const path = join(ledgerDir, `${verification.nonce_hash}.json`)
  const receipt = JSON.stringify({
    schema_version: 1,
    authorization_id: verification.authorization_id,
    nonce_hash: verification.nonce_hash,
    source_sha: verification.source_sha,
    image_digest: verification.image_digest,
    consumed_at: consumedAt.toISOString(),
  }, null, 2)
  try {
    await writeFile(path, `${receipt}\n`, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('Authorization nonce replay detected during atomic consumption')
    throw error
  }
  return path
}

function parseArgs(argv) {
  const options = { requiredActions: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = argv[i + 1]
    if (arg === '--required-action') {
      options.requiredActions.push(value)
      i += 1
      continue
    }
    if (arg === '--consume-nonce') {
      options.consumeNonce = true
      continue
    }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`)
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
    options[arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value
    i += 1
  }
  return options
}

async function cli() {
  const args = parseArgs(process.argv.slice(2))
  const required = [
    'record', 'publicKey', 'expectedRepository', 'expectedBranch', 'expectedSourceSha',
    'expectedImageDigest', 'expectedProvider', 'expectedRegion', 'executionSpendCapAudCents',
  ]
  for (const name of required) assert.ok(args[name], `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required`)
  const record = JSON.parse(await readFile(args.record, 'utf8'))
  const publicKeyPem = await readFile(args.publicKey, 'utf8')
  const consumed = new Set()
  if (args.nonceLedgerDir) {
    const hash = nonceHash(record.authorization?.nonce ?? '')
    if (await nonceConsumed(args.nonceLedgerDir, hash)) consumed.add(hash)
  }
  const verification = verifyOwnerAuthorization({
    record,
    publicKeyPem,
    expectedRepository: args.expectedRepository,
    expectedBranch: args.expectedBranch,
    expectedSourceSha: args.expectedSourceSha,
    expectedImageDigest: args.expectedImageDigest,
    expectedProvider: args.expectedProvider,
    expectedRegion: args.expectedRegion,
    executionSpendCapAudCents: Number(args.executionSpendCapAudCents),
    requiredActions: args.requiredActions,
    now: args.now ? new Date(args.now) : new Date(),
    consumedNonceHashes: consumed,
  })
  if (args.consumeNonce) {
    assert.ok(args.nonceLedgerDir, '--nonce-ledger-dir is required with --consume-nonce')
    await consumeAuthorizationNonce({ ledgerDir: args.nonceLedgerDir, verification })
  }
  process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  cli().catch((error) => {
    process.stderr.write(`OWNER_AUTHORIZATION_REJECTED: ${error.message}\n`)
    process.exitCode = 1
  })
}

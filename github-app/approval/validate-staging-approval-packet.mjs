#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function text(name) {
  return readFile(new URL(name, import.meta.url), 'utf8')
}

const plan = JSON.parse(await text('staging-activation-plan.json.example'))
assert.equal(plan.schema_version, 1)
assert.equal(plan.status, 'TEMPLATE_ONLY_NO_EXECUTION')
assert.equal(plan.environment, 'staging')
assert.equal(plan.provider.candidate, 'render')
assert.equal(plan.provider.region, 'singapore')
assert.equal(plan.provider.resource_creation_approved, false)
assert.equal(plan.provider.spend_approved, false)
assert.equal(plan.provider.spend_cap_aud, 0)
assert.equal(plan.provider.production_use_approved, false)

assert.equal(plan.source.approved_source_sha, '__SET_AFTER_FINAL_CI__')
assert.equal(plan.source.approved_image_digest, '__SET_AFTER_FINAL_CI__')
assert.equal(plan.source.require_exact_source_match, true)
assert.equal(plan.source.require_exact_image_match, true)
assert.equal(plan.source.invalidate_approval_on_source_change, true)

assert.equal(plan.service.runtime, 'oci-container')
assert.equal(plan.service.node_major, 22)
assert.equal(plan.service.instances, 1)
assert.equal(plan.service.scale_to_zero, false)
assert.equal(plan.service.auto_deploy, false)
assert.equal(plan.service.migration_command, 'npm run migrate')
assert.equal(plan.service.start_command, 'npm start')
assert.equal(plan.database.dedicated_marketplace_database, true)
assert.equal(plan.database.customer_supabase_reuse_allowed, false)
assert.equal(plan.database.legacy_database_reuse_allowed, false)
assert.equal(plan.database.public_ingress_allowed, false)

assert.deepEqual(plan.github_app.permissions, {
  metadata: 'read',
  pull_requests: 'read',
  checks: 'write',
})
assert.deepEqual(plan.github_app.events, ['installation', 'pull_request', 'marketplace_purchase'])
assert.equal(plan.github_app.external_configuration_change_approved, false)

const requiredSecrets = [
  'DATABASE_URL',
  'GITHUB_APP_ID',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_WEBHOOK_SECRET',
  'GITHUB_PRIVATE_KEY_B64',
  'SESSION_SECRET',
  'ADMIN_TOKEN',
]
assert.deepEqual(plan.secret_references.map((item) => item.name), requiredSecrets)
for (const secret of plan.secret_references) {
  assert.equal(secret.reference, '__STAGING_SECRET_REFERENCE__')
  assert.equal(secret.value_in_manifest, false)
}

for (const [gate, value] of Object.entries(plan.owner_gates)) {
  assert.equal(value, false, `Owner gate ${gate} must default false`)
}
for (const [stop, value] of Object.entries(plan.hard_stops)) {
  assert.equal(value, true, `Hard stop ${stop} must remain true`)
}

assert.equal(plan.execution_sequence.length, 16)
for (let index = 0; index < plan.execution_sequence.length; index += 1) {
  const step = plan.execution_sequence[index]
  assert.equal(step.id, `STG-ACT-${String(index + 1).padStart(3, '0')}`)
  assert.match(step.receipt, /^RCP-STG-\d{3}$/)
  if (step.mutating) {
    assert.ok(step.gate, `${step.id} mutating step requires a named gate`)
    assert.equal(plan.owner_gates[step.gate], false, `${step.id} gate must default false`)
  }
}

const packet = await text('STAGING_EXECUTION_APPROVAL_PACKET.md')
assert.match(packet, /TEMPLATE ONLY \/ NO EXECUTION AUTHORITY \/ NO PROVIDER CALLS \/ NO SPEND/)
assert.match(packet, /Any source change after approval invalidates the source\/image approval/i)
assert.match(packet, /spend cap: \*\*A\$0\*\*/)
assert.match(packet, /Every mutating step has a named owner gate/)
assert.match(packet, /The generator is a review artifact, not an executor/)
assert.match(packet, /Production promotion: \*\*NOT APPROVED BY THIS PACKET\*\*/)
assert.match(packet, /RCP-STG-001.*RCP-STG-010/s)

const generator = await text('generate-staging-dry-run.mjs')
assert.match(generator, /DRY-RUN ONLY/)
assert.match(generator, /NO COMMANDS WILL BE EXECUTED/)
assert.match(generator, /BLOCKED BY DEFAULT/)
assert.match(generator, /production promotion remains BLOCKED/)
assert.doesNotMatch(generator, /child_process|spawn\(|exec\(|execFile\(|fork\(/)
assert.doesNotMatch(generator, /node:https|node:http|node:net|node:dns|node:tls/)
assert.doesNotMatch(generator, /\bfetch\s*\(/)
assert.doesNotMatch(generator, /\bcurl\b|\bwget\b|render\.com\/api|api\.github\.com/)
assert.doesNotMatch(generator, /writeFile|appendFile|rm\(|unlink\(|mkdir\(/)

const allText = `${JSON.stringify(plan)}\n${packet}\n${generator}`
assert.doesNotMatch(allText, /sk_live_|rk_live_|sb_secret_[A-Za-z0-9]|ghp_[A-Za-z0-9]|github_pat_[A-Za-z0-9]/)
assert.doesNotMatch(allText, /postgresql:\/\/[^\s"']+:[^\s"']+@/)

console.log('Staging execution approval packet validated')

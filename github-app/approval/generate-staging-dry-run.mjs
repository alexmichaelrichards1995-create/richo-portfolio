#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

const manifestUrl = new URL('staging-activation-plan.json.example', import.meta.url)
const plan = JSON.parse(await readFile(manifestUrl, 'utf8'))

function fail(message) {
  throw new Error(message)
}

if (plan.status !== 'TEMPLATE_ONLY_NO_EXECUTION') fail('Manifest is not template-only')
if (plan.environment !== 'staging') fail('Manifest environment must be staging')
if (plan.provider.production_use_approved !== false) fail('Production use must remain false')
if (plan.hard_stops.production_promotion_blocked !== true) fail('Production promotion hard stop missing')

const secretNames = plan.secret_references.map((item) => item.name)
for (const item of plan.secret_references) {
  if (item.value_in_manifest !== false) fail(`Secret ${item.name} must not have a value in the manifest`)
  if (item.reference !== '__STAGING_SECRET_REFERENCE__') fail(`Secret ${item.name} reference must remain a placeholder in the repository template`)
}

const lines = []
lines.push('DRY-RUN ONLY :: R.I.C.H.O. Marketplace staging activation review')
lines.push(`DRY-RUN ONLY :: environment=${plan.environment}`)
lines.push(`DRY-RUN ONLY :: provider-candidate=${plan.provider.candidate} region=${plan.provider.region}`)
lines.push(`DRY-RUN ONLY :: source-sha=${plan.source.approved_source_sha}`)
lines.push(`DRY-RUN ONLY :: image-digest=${plan.source.approved_image_digest}`)
lines.push(`DRY-RUN ONLY :: secret-references=${secretNames.join(',')}`)
lines.push('DRY-RUN ONLY :: NO COMMANDS WILL BE EXECUTED; NO NETWORK OR PROVIDER API IS USED')

for (const step of plan.execution_sequence) {
  const gate = step.mutating ? step.gate || 'MISSING_GATE' : 'read-only'
  const currentGateState = step.mutating ? plan.owner_gates[gate] : null
  const state = step.mutating
    ? currentGateState === true
      ? 'WOULD REQUIRE REVALIDATION AT EXECUTION TIME'
      : 'BLOCKED BY DEFAULT'
    : 'REVIEW/OBSERVE ONLY'

  lines.push(
    `DRY-RUN ONLY :: ${step.id} :: action=${step.action} :: mutating=${step.mutating} :: gate=${gate} :: state=${state} :: receipt=${step.receipt}`,
  )
}

lines.push('DRY-RUN ONLY :: production promotion remains BLOCKED')
lines.push('DRY-RUN ONLY :: merge/live-payments/connect/payouts/dns remain BLOCKED')

process.stdout.write(`${lines.join('\n')}\n`)

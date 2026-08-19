import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

function hasAssignment(text, name) {
  return new RegExp(`^${name}=`, 'm').test(text)
}

test('public customer liveness does not disclose configuration state', async () => {
  const health = await source('app/api/health/route.ts')

  assert.match(health, /service: 'richo-systems-platform'/)
  assert.match(health, /status: 'ok'/)
  assert.match(health, /Cache-Control': 'no-store'/)
  assert.doesNotMatch(health, /supabaseConfigured/)
  assert.doesNotMatch(health, /NEXT_PUBLIC_SUPABASE/)
  assert.doesNotMatch(health, /STRIPE_/)
})

test('customer readiness fails closed behind server-side dependencies', async () => {
  const readiness = await source('app/api/health/ready/route.ts')

  assert.match(readiness, /createAdminClient/)
  assert.match(readiness, /getStripe\(\)/)
  assert.match(readiness, /getStripeWebhookSecret\(\)/)
  assert.match(readiness, /\.from\('products'\)/)
  assert.match(readiness, /NODE_ENV === 'production'/)
  assert.match(readiness, /url\.protocol !== 'https:'/)
  assert.match(readiness, /readinessResponse\(false, 503\)/)
  assert.match(readiness, /Cache-Control': 'no-store'/)
  assert.doesNotMatch(readiness, /return NextResponse\.json\([^)]*process\.env/s)
})

test('environment examples preserve commercial credential separation and default-off money gates', async () => {
  const rootEnv = await source('.env.example')
  const githubEnv = await source('github-app/.env.example')

  assert.equal(hasAssignment(rootEnv, 'STRIPE_MODE'), true)
  assert.match(rootEnv, /^STRIPE_MODE=test$/m)
  assert.match(rootEnv, /^RICHO_LIVE_PAYMENTS_ENABLED=false$/m)
  assert.equal(hasAssignment(rootEnv, 'STRIPE_RESTRICTED_KEY'), true)
  assert.equal(hasAssignment(rootEnv, 'LEGACY_MARKETPLACE_DATABASE_URL'), true)
  assert.equal(hasAssignment(rootEnv, 'STRIPE_CONNECT_SECRET_KEY'), true)
  assert.match(rootEnv, /^RICHO_MARKETPLACE_CONNECT_ENABLED=false$/m)
  assert.match(rootEnv, /^RICHO_LIVE_PAYOUTS_ENABLED=false$/m)

  assert.equal(hasAssignment(githubEnv, 'DATABASE_URL'), true)
  assert.equal(hasAssignment(githubEnv, 'DATABASE_SSL'), true)
  assert.equal(hasAssignment(githubEnv, 'GITHUB_PRIVATE_KEY_B64'), true)
  assert.equal(hasAssignment(githubEnv, 'SESSION_SECRET'), true)
  assert.equal(hasAssignment(githubEnv, 'ADMIN_TOKEN'), true)
  assert.equal(hasAssignment(githubEnv, 'SUPABASE_SECRET_KEY'), false)
  assert.equal(hasAssignment(githubEnv, 'STRIPE_RESTRICTED_KEY'), false)
  assert.equal(hasAssignment(githubEnv, 'LEGACY_MARKETPLACE_DATABASE_URL'), false)
})

test('release runbook keeps infrastructure, rollback, money and owner gates explicit', async () => {
  const runbook = await source('PREPRODUCTION_READINESS.md')

  assert.match(runbook, /Current decision: \*\*NO-GO for production activation\*\*/)
  assert.match(runbook, /PRE-001/)
  assert.match(runbook, /PRE-008/)
  assert.match(runbook, /richo-digital-deliveries/)
  assert.match(runbook, /Leaked-password protection|leaked-password protection/i)
  assert.match(runbook, /127\.0\.0\.1:5432/)
  assert.match(runbook, /Rollback plan/)
  assert.match(runbook, /Owner sign-off checklist/)
  assert.match(runbook, /Live payment gate separately approved/)
  assert.match(runbook, /Payout gate separately approved/)
  assert.match(runbook, /status remains \*\*NO-GO \/ PRE-PRODUCTION\*\*/)
})

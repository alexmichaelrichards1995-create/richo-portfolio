#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function text(name) {
  return readFile(new URL(name, import.meta.url), 'utf8')
}

const settings = JSON.parse(await text('github-app-settings.staging.json.example'))
assert.equal(settings.status, 'TEMPLATE_ONLY_NO_EXTERNAL_MUTATION')
assert.equal(settings.environment, 'staging')
assert.equal(settings.oauth_callback_url, 'https://STAGING_HOST/auth/github/callback')
assert.equal(settings.webhook_url, 'https://STAGING_HOST/webhooks/github')
assert.deepEqual(settings.repository_permissions, {
  metadata: 'read',
  pull_requests: 'read',
  checks: 'write',
})
assert.deepEqual(settings.subscribed_events, ['installation', 'pull_request', 'marketplace_purchase'])
assert.ok(settings.prohibited_default_permissions.includes('organization_administration'))

const envTemplate = await text('staging.env.example')
assert.match(envTemplate, /^RICHO_ENVIRONMENT=staging$/m)
assert.match(envTemplate, /^DATABASE_SSL=true$/m)
assert.match(envTemplate, /^RICHO_LIVE_PAYMENTS_ENABLED=false$/m)
assert.match(envTemplate, /^RICHO_CONNECT_ENABLED=false$/m)
assert.match(envTemplate, /^RICHO_PAYOUTS_ENABLED=false$/m)
assert.doesNotMatch(envTemplate, /sk_live_|rk_live_|whsec_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9]/)
assert.doesNotMatch(envTemplate, /^LEGACY_MARKETPLACE_DATABASE_URL=/m)
assert.doesNotMatch(envTemplate, /^SUPABASE_/m)

const migration = await text('MIGRATION_BACKUP_REHEARSAL.md')
assert.match(migration, /ZERO-PROVISION \/ NO LIVE DATABASE MUTATION AUTHORISED/)
assert.match(migration, /pg_dump --format=custom/)
assert.match(migration, /pg_restore --list/)
assert.match(migration, /fresh isolated staging database/)
assert.match(migration, /npm run migrate/)
assert.match(migration, /RCP-STG-003/)
assert.match(migration, /RCP-STG-009/)

const rollback = await text('ROLLBACK_DRILL.md')
assert.match(rollback, /ZERO-PROVISION \/ REHEARSAL DESIGN ONLY/)
assert.match(rollback, /fresh restore target/i)
assert.match(rollback, /prior immutable OCI image/i)
assert.match(rollback, /public `GET \/health\/ready` contains only the `ok` field/)
assert.match(rollback, /stale Vercel `richo-github-app` deployment/)
assert.match(rollback, /RCP-STG-009/)

const receipts = await text('RCP_STAGING_RECEIPTS.md')
for (let n = 1; n <= 10; n += 1) {
  assert.match(receipts, new RegExp(`RCP-STG-${String(n).padStart(3, '0')}`))
}
assert.match(receipts, /CONFIGURED` is not equivalent to `VERIFIED/)
assert.match(receipts, /Production approval cannot be inferred/)
assert.doesNotMatch(receipts, /postgresql:\/\/[^\s]*:[^\s]*@/)

const collector = await text('collect-staging-evidence.mjs')
assert.match(collector, /RICHO_ENVIRONMENT must equal staging/)
assert.match(collector, /appears production-like; refusing rehearsal/)
assert.match(collector, /Public readiness exposed fields other than ok/)
assert.match(collector, /Collector leaked secret value/)
assert.match(collector, /mode: 0o600/)
assert.doesNotMatch(collector, /console\.log\([^\n]*(GITHUB_CLIENT_SECRET|GITHUB_WEBHOOK_SECRET|SESSION_SECRET|ADMIN_TOKEN)/)

const webhookJobCollector = await text('collect-webhook-job-evidence.mjs')
assert.match(webhookJobCollector, /RICHO_ENVIRONMENT must equal staging/)
assert.match(webhookJobCollector, /SELECT delivery_id, event_name, action, status, processed_at/)
assert.match(webhookJobCollector, /SELECT id, kind, status, attempts, max_attempts/)
assert.doesNotMatch(webhookJobCollector, /SELECT \*/)
assert.doesNotMatch(webhookJobCollector, /SELECT[^`]*\bpayload\b[^`]*/is)
assert.match(webhookJobCollector, /Evidence output contains DATABASE_URL/)
assert.match(webhookJobCollector, /mode: 0o600/)

const oauthCollector = await text('collect-oauth-session-evidence.mjs')
assert.match(oauthCollector, /RICHO_ENVIRONMENT must equal staging/)
assert.match(oauthCollector, /redirect: 'manual'/)
assert.match(oauthCollector, /redirectHost === 'github\.com'/)
assert.match(oauthCollector, /signed_state_parameter_present/)
assert.match(oauthCollector, /interactive_login_completed: false/)
assert.match(oauthCollector, /never captures OAuth codes\/tokens/)
assert.match(oauthCollector, /mode: 0o600/)

const orchestrator = await text('ZERO_PROVISION_REHEARSAL.md')
assert.match(orchestrator, /CODE-ONLY \/ NO PROVIDER PROVISIONING \/ NO EXTERNAL CONFIGURATION MUTATION \/ NO SPEND/)
assert.match(orchestrator, /Phase A — source-only validation/)
assert.match(orchestrator, /Phase C — database rehearsal/)
assert.match(orchestrator, /Phase E — GitHub staging integration/)
assert.match(orchestrator, /Phase F — OAuth\/session boundary/)
assert.match(orchestrator, /every receipt is `VERIFIED` or explicitly `BLOCKED`/)
assert.match(orchestrator, /not evidence that staging is `PROVISIONED`, `CONFIGURED`, or `LIVE`/)

console.log('Zero-provision staging rehearsal package validated')

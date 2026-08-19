import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

const [
  customerWebhook,
  customerDashboard,
  legacyDb,
  legacyWebhook,
  legacyConnect,
  canonicalMarketplace,
  canonicalMigration,
  envExample,
  packageJson,
] = await Promise.all([
  source('app/api/webhooks/stripe/route.ts'),
  source('app/protected/page.tsx'),
  source('db/db_client.js'),
  source('marketplace_webhook_handler.js'),
  source('stripe_connect.js'),
  source('github-app/src/server.js'),
  source('github-app/sql/002_namespace_marketplace_subscriptions.sql'),
  source('.env.example'),
  source('package.json'),
])

test('customer commerce owns only the customer subscription namespace', () => {
  assert.match(customerWebhook, /customer_subscriptions/)
  assert.match(customerDashboard, /customer_subscriptions/)
  assert.doesNotMatch(customerWebhook, /legacy_marketplace_subscriptions/)
  assert.doesNotMatch(customerWebhook, /marketplace_subscriptions/)
})

test('canonical GitHub App owns only the canonical Marketplace namespace', () => {
  assert.match(canonicalMarketplace, /marketplace_subscriptions/)
  assert.match(canonicalMigration, /RENAME TO marketplace_subscriptions/)
  assert.doesNotMatch(canonicalMarketplace, /customer_subscriptions/)
  assert.doesNotMatch(canonicalMarketplace, /legacy_marketplace_subscriptions/)
})

test('legacy compatibility storage cannot attach through generic DATABASE_URL', () => {
  assert.match(legacyDb, /LEGACY_MARKETPLACE_DATABASE_URL/)
  assert.match(legacyDb, /legacy_marketplace_subscriptions/)
  assert.doesNotMatch(legacyDb, /process\.env\.DATABASE_URL/)
  assert.doesNotMatch(legacyDb, /process\.env\.PGHOST/)
})

test('legacy webhook fails closed and has no known fallback secret', () => {
  assert.match(legacyWebhook, /process\.env\.GITHUB_WEBHOOK_SECRET/)
  assert.match(legacyWebhook, /Webhook secret not configured/)
  assert.match(legacyWebhook, /timingSafeEqual/)
  assert.doesNotMatch(legacyWebhook, /replace-me/)
})

test('legacy Stripe Connect and payouts require separate credentials and explicit gates', () => {
  assert.match(legacyConnect, /STRIPE_CONNECT_SECRET_KEY/)
  assert.match(legacyConnect, /RICHO_MARKETPLACE_CONNECT_ENABLED/)
  assert.match(legacyConnect, /RICHO_LIVE_PAYOUTS_ENABLED/)
  assert.doesNotMatch(legacyConnect, /STRIPE_RESTRICTED_KEY/)
  assert.doesNotMatch(legacyConnect, /acct_stub/)
})

test('environment contract documents three non-interchangeable persistence/payment lanes', () => {
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_URL/)
  assert.match(envExample, /LEGACY_MARKETPLACE_DATABASE_URL/)
  assert.match(envExample, /github-app\/\.env\.example/)
  assert.match(envExample, /STRIPE_CONNECT_SECRET_KEY/)
  assert.match(envExample, /RICHO_MARKETPLACE_CONNECT_ENABLED=false/)
  assert.match(envExample, /RICHO_LIVE_PAYOUTS_ENABLED=false/)
})

test('root package keeps modern customer platform while preserving compatibility dependencies', () => {
  const pkg = JSON.parse(packageJson)
  assert.equal(pkg.engines.node, '>=22 <23')
  assert.equal(pkg.dependencies.next, '16.2.12')
  assert.equal(pkg.dependencies.react, '19.2.8')
  assert.equal(pkg.dependencies.stripe, '22.5.0')
  assert.equal(pkg.dependencies.express, '4.22.2')
  assert.equal(pkg.dependencies.pg, '8.22.0')
})

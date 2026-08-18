import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import Stripe from 'stripe'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('Stripe webhook signatures are cryptographically verified', () => {
  const stripe = new Stripe('rk_test_contract_only')
  const secret = 'whsec_contract_test_secret'
  const payload = JSON.stringify({
    id: 'evt_richo_contract',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_contract', object: 'checkout.session' } },
  })
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret })
  const event = stripe.webhooks.constructEvent(payload, header, secret)
  assert.equal(event.id, 'evt_richo_contract')

  assert.throws(() => {
    stripe.webhooks.constructEvent(payload, header, 'whsec_wrong_secret')
  })
})

test('Checkout preserves hosted dynamic-payment security posture', async () => {
  const checkout = await source('app/api/checkout/route.ts')

  assert.match(checkout, /auth\.getClaims\(\)/)
  assert.match(checkout, /sameOriginAllowed/)
  assert.match(checkout, /checkout\.sessions\.create/)
  assert.match(checkout, /integration_identifier/)
  assert.match(checkout, /idempotencyKey/)
  assert.doesNotMatch(checkout, /payment_method_types/)
  assert.doesNotMatch(checkout, /automatic_tax/)
})

test('Download checkout requires and snapshots secure Storage delivery metadata', async () => {
  const checkout = await source('app/api/checkout/route.ts')

  assert.match(checkout, /metadataString\(product\.metadata, 'storage_bucket'\)/)
  assert.match(checkout, /metadataString\(product\.metadata, 'storage_path'\)/)
  assert.match(checkout, /product\.delivery_mode === 'download'/)
  assert.match(checkout, /Download product is not configured for secure delivery/)
  assert.match(checkout, /storage_bucket: storageBucket/)
  assert.match(checkout, /storage_path: storagePath/)
  assert.match(checkout, /metadata: orderItemMetadata/)
})

test('Customer Portal is authenticated, same-origin and server-customer-bound', async () => {
  const portal = await source('app/api/billing/portal/route.ts')
  const launcher = await source('components/billing/manage-billing-button.tsx')

  assert.match(portal, /auth\.getClaims\(\)/)
  assert.match(portal, /sameOriginAllowed/)
  assert.match(portal, /customer_subscriptions/)
  assert.match(portal, /\.eq\('user_id', claims\.sub\)/)
  assert.match(portal, /\.eq\('payment_provider', 'stripe'\)/)
  assert.match(portal, /provider_customer_id/)
  assert.match(portal, /billingPortal\.sessions\.create/)
  assert.match(portal, /return_url/)
  assert.doesNotMatch(launcher, /provider_customer_id/)
  assert.doesNotMatch(launcher, /STRIPE_(?:RESTRICTED|WEBHOOK|SECRET)/)
  assert.doesNotMatch(launcher, /SUPABASE_(?:SECRET|SERVICE_ROLE)/)
})

test('Webhook keeps raw-body verification, durable ledger and retry semantics', async () => {
  const webhook = await source('app/api/webhooks/stripe/route.ts')

  assert.match(webhook, /request\.text\(\)/)
  assert.match(webhook, /stripe-signature/)
  assert.match(webhook, /webhooks\.constructEvent/)
  assert.match(webhook, /payment_events/)
  assert.match(webhook, /checkout\.session\.async_payment_succeeded/)
  assert.match(webhook, /customer\.subscription\.updated/)
  assert.match(webhook, /status: 500/)
  assert.doesNotMatch(webhook, /process\.env\.NEXT_PUBLIC_.*(?:SECRET|SERVICE|STRIPE)/)
})

test('Subscription lifecycle persists Stripe item billing periods', async () => {
  const period = await source('lib/commerce/subscription-period.ts')
  const webhook = await source('app/api/webhooks/stripe/route.ts')

  assert.match(period, /item\.current_period_start/)
  assert.match(period, /item\.current_period_end/)
  assert.match(webhook, /current_period_start: unixSecondsToIso\(currentPeriodStart\)/)
  assert.match(webhook, /current_period_end: unixSecondsToIso\(currentPeriodEnd\)/)
  assert.match(webhook, /subscription\.ended_at/)
})

test('Stripe server defaults to test mode and live money requires a second explicit gate', async () => {
  const stripeServer = await source('lib/stripe/server.ts')

  assert.match(stripeServer, /process\.env\.STRIPE_MODE \|\| 'test'/)
  assert.match(stripeServer, /\(\?:rk\|sk\)_test_/)
  assert.match(stripeServer, /\(\?:rk\|sk\)_live_/)
  assert.match(stripeServer, /detected !== configured/)
  assert.match(stripeServer, /RICHO_LIVE_PAYMENTS_ENABLED !== 'true'/)
  assert.match(stripeServer, /Live Stripe operations are disabled/)
})

test('Stripe mock transport is isolated to test mode and non-production hosts', async () => {
  const stripeServer = await source('lib/stripe/server.ts')
  const workflow = await source('.github/workflows/next-supabase-foundation-ci.yml')

  assert.match(stripeServer, /STRIPE_TEST_MOCK_ENABLED === 'true'/)
  assert.match(stripeServer, /mode !== 'test'/)
  assert.match(stripeServer, /Stripe mock transport is only permitted in test mode/)
  assert.match(stripeServer, /host === 'api\.stripe\.com'/)
  assert.match(stripeServer, /protocol: 'http'/)
  assert.match(workflow, /stripe\/stripe-mock:v0\.202\.0/)
  assert.match(workflow, /STRIPE_MODE: test/)
  assert.match(workflow, /STRIPE_TEST_MOCK_ENABLED: 'true'/)
})

test('Secure download requires owned active download entitlement and short-lived signed URL', async () => {
  const download = await source('app/api/entitlements/[id]/download/route.ts')

  assert.match(download, /auth\.getClaims\(\)/)
  assert.match(download, /\.from\('entitlements'\)/)
  assert.match(download, /\.eq\('user_id', claims\.sub\)/)
  assert.match(download, /entitlement\.status !== 'active'/)
  assert.match(download, /entitlement\.entitlement_type !== 'download'/)
  assert.match(download, /storage_bucket/)
  assert.match(download, /storage_path/)
  assert.match(download, /createSignedUrl\(path, 120, \{ download: true \}\)/)
  assert.match(download, /Cache-Control': 'no-store'/)
  assert.doesNotMatch(download, /getPublicUrl/)
})

test('Checkout return never acts as payment or entitlement proof', async () => {
  const dashboard = await source('app/protected/page.tsx')

  assert.match(dashboard, /checkoutReturned/)
  assert.match(dashboard, /Payment and access are confirmed only after the signed Stripe webhook is reconciled/)
  assert.match(dashboard, /order and entitlement states below are the authoritative result/)
  assert.match(dashboard, /entitlement\.entitlement_type === 'download' && entitlement\.status === 'active'/)
  assert.match(dashboard, /Secure download/)
})

test('Server credentials cannot migrate into browser code', async () => {
  const admin = await source('lib/supabase/admin.ts')
  const stripeServer = await source('lib/stripe/server.ts')
  const checkoutButton = await source('components/commerce/checkout-button.tsx')
  const billingButton = await source('components/billing/manage-billing-button.tsx')

  assert.match(admin, /SUPABASE_SECRET_KEY/)
  assert.doesNotMatch(admin, /NEXT_PUBLIC_SUPABASE_SECRET/)
  assert.match(stripeServer, /STRIPE_RESTRICTED_KEY/)
  assert.match(stripeServer, /STRIPE_WEBHOOK_SECRET/)
  assert.doesNotMatch(checkoutButton, /STRIPE_(?:RESTRICTED|WEBHOOK|SECRET)/)
  assert.doesNotMatch(checkoutButton, /SUPABASE_(?:SECRET|SERVICE_ROLE)/)
  assert.doesNotMatch(billingButton, /STRIPE_(?:RESTRICTED|WEBHOOK|SECRET)/)
  assert.doesNotMatch(billingButton, /SUPABASE_(?:SECRET|SERVICE_ROLE)/)
})

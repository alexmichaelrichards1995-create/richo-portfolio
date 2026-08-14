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

test('Server credentials cannot migrate into browser code', async () => {
  const admin = await source('lib/supabase/admin.ts')
  const stripeServer = await source('lib/stripe/server.ts')
  const checkoutButton = await source('components/commerce/checkout-button.tsx')

  assert.match(admin, /SUPABASE_SECRET_KEY/)
  assert.doesNotMatch(admin, /NEXT_PUBLIC_SUPABASE_SECRET/)
  assert.match(stripeServer, /STRIPE_RESTRICTED_KEY/)
  assert.match(stripeServer, /STRIPE_WEBHOOK_SECRET/)
  assert.doesNotMatch(checkoutButton, /STRIPE_(?:RESTRICTED|WEBHOOK|SECRET)/)
  assert.doesNotMatch(checkoutButton, /SUPABASE_(?:SECRET|SERVICE_ROLE)/)
})

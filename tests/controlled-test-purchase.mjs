import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const siteUrl = process.env.SITE_URL || 'http://127.0.0.1:3000'
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

assert.ok(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL is required')
assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required')
assert.ok(webhookSecret, 'STRIPE_WEBHOOK_SECRET is required')
assert.equal(process.env.STRIPE_MODE, 'test', 'controlled purchase must run in Stripe test mode')
assert.equal(process.env.STRIPE_TEST_MOCK_ENABLED, 'true', 'controlled purchase requires Stripe mock transport')
assert.notEqual(process.env.RICHO_LIVE_PAYMENTS_ENABLED, 'true', 'live payments must remain disabled')

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
const stripe = new Stripe('sk_test_controlled_purchase_only')

const runId = crypto.randomUUID().replaceAll('-', '')
const email = `richo-ci-${runId}@example.test`
const password = `R!cho-CI-${runId.slice(0, 18)}`

const { data: product, error: productError } = await admin
  .from('products')
  .select('id, sku, slug, name, product_type, delivery_mode, status, price_amount, currency, metadata')
  .eq('sku', 'RICHO-PILOT-199')
  .single()

assert.ifError(productError)
assert.equal(product.status, 'active')
assert.equal(product.product_type, 'service')
assert.equal(product.delivery_mode, 'service_delivery')
assert.equal(product.price_amount, 19900)
assert.equal(product.currency, 'AUD')
assert.equal(product.metadata?.storage_bucket, 'richo-digital-deliveries')
assert.equal(product.metadata?.delivery_asset_kind, 'onboarding')

const { data: bucketFiles, error: bucketError } = await admin.storage
  .from('richo-digital-deliveries')
  .list('richo-pilot-199', { limit: 20 })

assert.ifError(bucketError)
assert.ok(
  bucketFiles?.some((file) => file.name === 'RICHO_AI_Operations_Pilot_Onboarding.md'),
  'Pilot onboarding asset must be seeded into the private bucket',
)

const { data: authUser, error: userError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})
assert.ifError(userError)
assert.ok(authUser.user?.id)
const userId = authUser.user.id

const checkoutReference = `cs_test_richo_${runId}`
const eventId = `evt_test_richo_${runId}`
const idempotencyKey = `ci-test-purchase-${runId}`

const { data: order, error: orderError } = await admin
  .from('orders')
  .insert({
    user_id: userId,
    status: 'processing',
    currency: product.currency,
    subtotal_amount: product.price_amount,
    tax_amount: 0,
    discount_amount: 0,
    total_amount: product.price_amount,
    payment_provider: 'stripe',
    checkout_reference: checkoutReference,
    idempotency_key: idempotencyKey,
    metadata: {
      source: 'controlled_ci_purchase',
      product_id: product.id,
      delivery_mode: product.delivery_mode,
    },
  })
  .select('id')
  .single()
assert.ifError(orderError)
assert.ok(order?.id)

const { data: orderItem, error: itemError } = await admin
  .from('order_items')
  .insert({
    order_id: order.id,
    product_id: product.id,
    sku_snapshot: product.sku,
    name_snapshot: product.name,
    unit_amount: product.price_amount,
    quantity: 1,
    metadata: {
      delivery_mode: product.delivery_mode,
      storage_bucket: product.metadata.storage_bucket,
      storage_path: product.metadata.storage_path,
      delivery_asset_kind: product.metadata.delivery_asset_kind,
    },
  })
  .select('id')
  .single()
assert.ifError(itemError)
assert.ok(orderItem?.id)

const payload = JSON.stringify({
  id: eventId,
  object: 'event',
  api_version: '2025-12-15.clover',
  created: Math.floor(Date.now() / 1000),
  livemode: false,
  pending_webhooks: 1,
  request: null,
  type: 'checkout.session.completed',
  data: {
    object: {
      id: checkoutReference,
      object: 'checkout.session',
      client_reference_id: order.id,
      metadata: {
        richo_order_id: order.id,
        richo_user_id: userId,
        richo_product_id: product.id,
        richo_product_type: product.product_type,
        richo_delivery_mode: product.delivery_mode,
      },
      mode: 'payment',
      payment_status: 'paid',
      amount_total: product.price_amount,
      currency: product.currency.toLowerCase(),
      payment_intent: `pi_test_richo_${runId}`,
      subscription: null,
    },
  },
})

const signature = stripe.webhooks.generateTestHeaderString({
  payload,
  secret: webhookSecret,
})

async function postWebhook() {
  return fetch(`${siteUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    body: payload,
  })
}

const firstResponse = await postWebhook()
const firstBody = await firstResponse.json()
assert.equal(firstResponse.status, 200, JSON.stringify(firstBody))
assert.equal(firstBody.received, true)
assert.equal(firstBody.ignored, false)

const { data: paidOrder, error: paidOrderError } = await admin
  .from('orders')
  .select('status, provider_reference, paid_at')
  .eq('id', order.id)
  .single()
assert.ifError(paidOrderError)
assert.equal(paidOrder.status, 'paid')
assert.equal(paidOrder.provider_reference, `pi_test_richo_${runId}`)
assert.ok(paidOrder.paid_at)

const { data: entitlements, error: entitlementError } = await admin
  .from('entitlements')
  .select('id, user_id, product_id, order_item_id, entitlement_type, status')
  .eq('order_item_id', orderItem.id)
assert.ifError(entitlementError)
assert.equal(entitlements.length, 1)
assert.equal(entitlements[0].user_id, userId)
assert.equal(entitlements[0].product_id, product.id)
assert.equal(entitlements[0].entitlement_type, 'service_access')
assert.equal(entitlements[0].status, 'active')

const { data: paymentEvent, error: paymentEventError } = await admin
  .from('payment_events')
  .select('status, event_type, entity_id')
  .eq('id', eventId)
  .single()
assert.ifError(paymentEventError)
assert.equal(paymentEvent.status, 'processed')
assert.equal(paymentEvent.event_type, 'checkout.session.completed')
assert.equal(paymentEvent.entity_id, order.id)

const duplicateResponse = await postWebhook()
const duplicateBody = await duplicateResponse.json()
assert.equal(duplicateResponse.status, 200, JSON.stringify(duplicateBody))
assert.equal(duplicateBody.received, true)
assert.equal(duplicateBody.duplicate, true)

const { count: entitlementCount, error: duplicateEntitlementError } = await admin
  .from('entitlements')
  .select('id', { count: 'exact', head: true })
  .eq('order_item_id', orderItem.id)
assert.ifError(duplicateEntitlementError)
assert.equal(entitlementCount, 1, 'duplicate webhook must not duplicate entitlement')

const { data: signedAsset, error: signedAssetError } = await admin.storage
  .from('richo-digital-deliveries')
  .createSignedUrl('richo-pilot-199/RICHO_AI_Operations_Pilot_Onboarding.md', 60)
assert.ifError(signedAssetError)
assert.ok(signedAsset?.signedUrl)

const assetResponse = await fetch(signedAsset.signedUrl)
assert.equal(assetResponse.status, 200)
const assetText = await assetResponse.text()
assert.match(assetText, /RICHO-PILOT-199/)
assert.match(assetText, /Human-review requirements/)

console.log('CONTROLLED TEST PURCHASE PASSED')
console.log(JSON.stringify({
  sku: product.sku,
  order_id: order.id,
  entitlement_id: entitlements[0].id,
  payment_event_id: eventId,
  duplicate_webhook_idempotent: true,
  private_onboarding_asset_verified: true,
}))

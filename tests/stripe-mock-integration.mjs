import assert from 'node:assert/strict'
import test from 'node:test'

import Stripe from 'stripe'

const stripe = new Stripe('sk_test_richo_mock_only', {
  host: process.env.STRIPE_TEST_MOCK_HOST || '127.0.0.1',
  port: Number(process.env.STRIPE_TEST_MOCK_PORT || '12111'),
  protocol: 'http',
  telemetry: false,
  maxNetworkRetries: 0,
  timeout: 5_000,
})

test('Stripe mock accepts R.I.C.H.O. hosted Checkout request shape', async () => {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: 'order_mock_001',
    success_url: 'https://example.test/protected?checkout=success',
    cancel_url: 'https://example.test/store/mock?checkout=cancelled',
    integration_identifier: 'richo_test_abcdefgh',
    allow_promotion_codes: true,
    metadata: {
      richo_order_id: 'order_mock_001',
      richo_user_id: 'user_mock_001',
      richo_product_id: 'product_mock_001',
      richo_product_type: 'digital',
      richo_delivery_mode: 'download',
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'aud',
          unit_amount: 1900,
          product_data: {
            name: 'R.I.C.H.O. Mock Digital Product',
            metadata: {
              richo_product_id: 'product_mock_001',
              richo_sku: 'RICHO-MOCK-001',
            },
          },
        },
      },
    ],
    payment_intent_data: {
      metadata: {
        richo_order_id: 'order_mock_001',
      },
    },
  })

  assert.equal(session.object, 'checkout.session')
  assert.equal(typeof session.id, 'string')
  assert.ok(session.id.length > 0)
})

test('Stripe mock accepts Customer Portal session request shape', async () => {
  const session = await stripe.billingPortal.sessions.create({
    customer: 'cus_richo_mock_001',
    return_url: 'https://example.test/protected',
  })

  assert.equal(session.object, 'billing_portal.session')
  assert.equal(typeof session.url, 'string')
  assert.ok(session.url.length > 0)
})

const assert = require('assert');
const Stripe = require('stripe');
const {
  normalizePayCoreSuccess,
  processStripePaymentEvent,
  constructStripeEvent,
} = require('../stripe_payment_webhook');

function event(overrides = {}) {
  return {
    id: overrides.id || 'evt_test_1',
    type: overrides.type || 'checkout.session.completed',
    created: overrides.created || 1786752000,
    livemode: Boolean(overrides.livemode),
    data: {
      object: {
        id: overrides.sessionId || 'cs_test_1',
        payment_status: overrides.paymentStatus || 'paid',
        amount_total: overrides.amountTotal === undefined ? 19900 : overrides.amountTotal,
        currency: overrides.currency || 'aud',
        payment_intent: overrides.paymentIntent || 'pi_test_1',
        metadata: overrides.metadata || {
          paycore_intent_id: 'paycore_intent_1',
          product_name: 'AI Business Upgrade',
        },
      },
    },
  };
}

(async () => {
  delete process.env.ALLOW_LIVE_STRIPE;

  const normalized = normalizePayCoreSuccess(event());
  assert.equal(normalized.accepted, true);
  assert.deepStrictEqual(normalized.payment, {
    stripeEventId: 'evt_test_1',
    eventType: 'checkout.session.completed',
    checkoutSessionId: 'cs_test_1',
    paymentIntentId: 'pi_test_1',
    paycoreIntentId: 'paycore_intent_1',
    amountMinor: 19900,
    currency: 'AUD',
    paymentStatus: 'paid',
    livemode: false,
    paidAt: '2026-08-15T00:00:00.000Z',
  });

  assert.deepStrictEqual(
    normalizePayCoreSuccess(event({ paymentStatus: 'unpaid' })),
    { accepted: false, reason: 'payment_not_paid' },
  );
  assert.deepStrictEqual(
    normalizePayCoreSuccess(event({ amountTotal: 0 })),
    { accepted: false, reason: 'no_positive_cleared_revenue' },
  );
  assert.deepStrictEqual(
    normalizePayCoreSuccess(event({ livemode: true })),
    { accepted: false, reason: 'live_mode_not_authorized' },
  );

  let persisted = null;
  const recorded = await processStripePaymentEvent(event(), {
    persist: async payment => {
      persisted = payment;
      return { status: 'recorded', intentId: payment.paycoreIntentId };
    },
  });
  assert.equal(recorded.status, 'recorded');
  assert.equal(recorded.intentId, 'paycore_intent_1');
  assert.equal(persisted.checkoutSessionId, 'cs_test_1');

  const ignored = await processStripePaymentEvent(event({ type: 'checkout.session.expired' }), {
    persist: async () => { throw new Error('must not persist ignored event'); },
  });
  assert.deepStrictEqual(ignored, { status: 'ignored', reason: 'event_not_revenue_success' });

  const StripeClient = Stripe('sk_test_placeholder');
  const secret = 'whsec_test_secret';
  const raw = JSON.stringify(event({ sessionId: 'cs_signed' }));
  const signature = StripeClient.webhooks.generateTestHeaderString({ payload: raw, secret });
  const parsed = constructStripeEvent(Buffer.from(raw), signature, secret, StripeClient);
  assert.equal(parsed.data.object.id, 'cs_signed');

  const asyncPaid = normalizePayCoreSuccess(event({
    type: 'checkout.session.async_payment_succeeded',
    sessionId: 'cs_async_paid',
  }));
  assert.equal(asyncPaid.accepted, true);

  console.log('OK: Stripe webhook is signed, paid-only, test-mode default, and PayCore-only');
})().catch(error => {
  console.error('FAILED', error);
  process.exit(1);
});

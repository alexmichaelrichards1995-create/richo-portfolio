const assert = require('assert');
const Stripe = require('stripe');
const {
  normalizeVerifiedPurchase,
  processStripePaymentEvent,
  constructStripeEvent,
  stableUuid,
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
        customer: overrides.customer || 'cus_test_1',
        subscription: overrides.subscription || null,
        client_reference_id: overrides.clientReferenceId || null,
        metadata: overrides.metadata || { product_name: 'AI Business Upgrade' },
      },
    },
  };
}

function memoryStore() {
  const rows = new Map();
  return {
    async upsertVerifiedPurchase(purchase) {
      const existing = rows.get(purchase.checkoutSessionId);
      if (existing) return existing;
      const row = { ...purchase, analytics_sent_at: null, analytics_attempts: 0 };
      rows.set(purchase.checkoutSessionId, row);
      return row;
    },
    async markAnalyticsAttempt(id, sent) {
      const row = rows.get(id);
      if (!row) throw new Error('missing row');
      row.analytics_attempts += 1;
      if (sent && !row.analytics_sent_at) row.analytics_sent_at = new Date().toISOString();
      return row;
    },
    rows,
  };
}

(async () => {
  const normalized = normalizeVerifiedPurchase(event({
    clientReferenceId: 'ph-user-123',
    amountTotal: 19900,
  }));
  assert.equal(normalized.accepted, true);
  assert.equal(normalized.purchase.amountMinor, 19900);
  assert.equal(normalized.purchase.currency, 'AUD');
  assert.equal(normalized.purchase.posthogDistinctId, 'ph-user-123');
  assert.equal(normalized.purchase.attributionQuality, 'client_reference_id');

  const unpaid = normalizeVerifiedPurchase(event({ paymentStatus: 'unpaid' }));
  assert.equal(unpaid.accepted, false);
  assert.equal(unpaid.reason, 'payment_not_paid');

  const zero = normalizeVerifiedPurchase(event({ amountTotal: 0 }));
  assert.equal(zero.accepted, false);
  assert.equal(zero.reason, 'no_positive_cleared_revenue');

  const store = memoryStore();
  const captures = [];
  const paidEvent = event({ sessionId: 'cs_paid_once', id: 'evt_paid_once' });

  const first = await processStripePaymentEvent(paidEvent, {
    store,
    capture: async payload => captures.push(payload),
  });
  assert.equal(first.status, 'recorded');
  assert.equal(captures.length, 1);
  assert.equal(captures[0].event, 'richo_purchase_completed');
  assert.equal(captures[0].properties.revenue, 19900);
  assert.equal(captures[0].properties.currency, 'AUD');
  assert.equal(captures[0].uuid, stableUuid('richo_purchase_completed:cs_paid_once'));

  const duplicate = await processStripePaymentEvent(paidEvent, {
    store,
    capture: async payload => captures.push(payload),
  });
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(captures.length, 1, 'duplicate Stripe delivery must not create duplicate revenue capture');

  const retryStore = memoryStore();
  let attempts = 0;
  const retryEvent = event({ sessionId: 'cs_retry', id: 'evt_retry' });
  try {
    await processStripePaymentEvent(retryEvent, {
      store: retryStore,
      capture: async () => {
        attempts += 1;
        throw new Error('temporary analytics outage');
      },
    });
    assert.fail('expected analytics failure');
  } catch (error) {
    assert.equal(error.message, 'temporary analytics outage');
  }
  assert.equal(retryStore.rows.get('cs_retry').analytics_sent_at, null);

  const retryCaptures = [];
  const recovered = await processStripePaymentEvent(retryEvent, {
    store: retryStore,
    capture: async payload => {
      attempts += 1;
      retryCaptures.push(payload);
    },
  });
  assert.equal(recovered.status, 'recorded');
  assert.equal(retryCaptures.length, 1);
  assert.equal(attempts, 2);

  const StripeClient = Stripe('sk_test_placeholder');
  const secret = 'whsec_test_secret';
  const raw = JSON.stringify(event({ sessionId: 'cs_signed' }));
  const signature = StripeClient.webhooks.generateTestHeaderString({ payload: raw, secret });
  const parsed = constructStripeEvent(Buffer.from(raw), signature, secret, StripeClient);
  assert.equal(parsed.data.object.id, 'cs_signed');

  const asyncPaid = normalizeVerifiedPurchase(event({
    type: 'checkout.session.async_payment_succeeded',
    sessionId: 'cs_async_paid',
  }));
  assert.equal(asyncPaid.accepted, true);

  console.log('OK: verified Stripe revenue webhook is paid-only, signed, retry-safe and idempotent');
})().catch(error => {
  console.error('FAILED', error);
  process.exit(1);
});

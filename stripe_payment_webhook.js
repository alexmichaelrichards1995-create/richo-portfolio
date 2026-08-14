/* stripe_payment_webhook.js
 * Signed Stripe Checkout webhook -> durable verified purchase -> PostHog revenue event.
 * Mount this router BEFORE any express.json() middleware so Stripe receives raw bytes.
 */

const express = require('express');
const crypto = require('crypto');
const Stripe = require('stripe');
const purchaseStore = require('./verified_purchase_store');
const { capturePostHogEvent } = require('./posthog_server');

const stripe = Stripe(process.env.STRIPE_API_KEY || 'sk_test_placeholder');
const router = express.Router();

const SUCCESS_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

function stableUuid(input) {
  const bytes = crypto.createHash('sha256').update(String(input)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function resolveDistinctId(session) {
  const metadataId = session.metadata && session.metadata.posthog_distinct_id;
  if (metadataId) return { id: String(metadataId), quality: 'posthog_metadata', processPerson: true };
  if (session.client_reference_id) return { id: String(session.client_reference_id), quality: 'client_reference_id', processPerson: true };
  if (session.customer) return { id: `stripe_customer:${session.customer}`, quality: 'stripe_customer_fallback', processPerson: false };
  return { id: `checkout_session:${session.id}`, quality: 'checkout_session_fallback', processPerson: false };
}

function normalizeVerifiedPurchase(event) {
  if (!event || !SUCCESS_EVENTS.has(event.type)) return { accepted: false, reason: 'event_not_revenue_success' };

  const session = event.data && event.data.object;
  if (!session || !session.id) return { accepted: false, reason: 'missing_checkout_session' };
  if (session.payment_status !== 'paid') return { accepted: false, reason: 'payment_not_paid' };

  const amountMinor = Number(session.amount_total);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return { accepted: false, reason: 'no_positive_cleared_revenue' };

  const currency = String(session.currency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { accepted: false, reason: 'invalid_currency' };

  const identity = resolveDistinctId(session);
  const paidAt = new Date(Number(event.created || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const analyticsEventUuid = stableUuid(`richo_purchase_completed:${session.id}`);
  const metadata = session.metadata || {};

  return {
    accepted: true,
    purchase: {
      stripeEventId: String(event.id),
      checkoutSessionId: String(session.id),
      paymentIntentId: session.payment_intent ? String(session.payment_intent) : null,
      subscriptionId: session.subscription ? String(session.subscription) : null,
      customerId: session.customer ? String(session.customer) : null,
      amountMinor,
      currency,
      product: metadata.product_name || metadata.product || metadata.offer || null,
      posthogDistinctId: identity.id,
      attributionQuality: identity.quality,
      processPerson: identity.processPerson,
      livemode: Boolean(event.livemode),
      paidAt,
      analyticsEventUuid,
    },
  };
}

async function processStripePaymentEvent(event, deps = {}) {
  const store = deps.store || purchaseStore;
  const capture = deps.capture || capturePostHogEvent;
  const normalized = normalizeVerifiedPurchase(event);
  if (!normalized.accepted) return { status: 'ignored', reason: normalized.reason };

  const purchase = normalized.purchase;
  const row = await store.upsertVerifiedPurchase(purchase);

  if (row && row.analytics_sent_at) {
    return { status: 'duplicate', checkoutSessionId: purchase.checkoutSessionId };
  }

  const properties = {
    revenue: purchase.amountMinor,
    currency: purchase.currency,
    checkout_session_id: purchase.checkoutSessionId,
    stripe_event_id: purchase.stripeEventId,
    payment_intent_id: purchase.paymentIntentId,
    subscription_id: purchase.subscriptionId,
    product: purchase.product,
    livemode: purchase.livemode,
    attribution_quality: purchase.attributionQuality,
    source: 'stripe_webhook',
  };

  if (!purchase.processPerson) properties.$process_person_profile = false;

  try {
    await capture({
      distinctId: purchase.posthogDistinctId,
      event: 'richo_purchase_completed',
      uuid: purchase.analyticsEventUuid,
      timestamp: purchase.paidAt,
      properties,
    });
    await store.markAnalyticsAttempt(purchase.checkoutSessionId, true);
  } catch (error) {
    await store.markAnalyticsAttempt(purchase.checkoutSessionId, false).catch(() => {});
    throw error;
  }

  return {
    status: 'recorded',
    checkoutSessionId: purchase.checkoutSessionId,
    amountMinor: purchase.amountMinor,
    currency: purchase.currency,
  };
}

function constructStripeEvent(rawBody, signature, secret, stripeClient = stripe) {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is required');
  if (!signature) throw new Error('Stripe-Signature header is required');
  return stripeClient.webhooks.constructEvent(rawBody, signature, secret);
}

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = constructStripeEvent(
      req.body,
      req.get('stripe-signature'),
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    return res.status(400).send('invalid webhook');
  }

  try {
    const result = await processStripePaymentEvent(event);
    return res.status(200).json({ received: true, status: result.status });
  } catch (error) {
    console.error('stripe revenue webhook processing failed', {
      eventId: event && event.id,
      eventType: event && event.type,
      message: error && error.message,
    });
    return res.status(500).send('processing failed');
  }
});

module.exports = {
  router,
  stableUuid,
  resolveDistinctId,
  normalizeVerifiedPurchase,
  processStripePaymentEvent,
  constructStripeEvent,
};

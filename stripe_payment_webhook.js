/* stripe_payment_webhook.js
 * Signed Stripe Checkout webhook -> authoritative PayCore payment state.
 *
 * PayCore is the only payment truth. This adapter does not create a second
 * purchase ledger and does not send revenue analytics directly. PostHog
 * delivery happens later through paycore_revenue_bridge.js after succeeded_at
 * is durable in payment_intents.
 *
 * Mount this router BEFORE any express.json() middleware so Stripe signature
 * verification receives the exact raw request bytes.
 */

const express = require('express');
const Stripe = require('stripe');
const paycoreStore = require('./paycore_stripe_store');

const stripe = Stripe(process.env.STRIPE_API_KEY || 'sk_test_placeholder');
const router = express.Router();

const SUCCESS_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

function normalizePayCoreSuccess(event) {
  if (!event || !SUCCESS_EVENTS.has(event.type)) {
    return { accepted: false, reason: 'event_not_revenue_success' };
  }

  if (event.livemode && process.env.ALLOW_LIVE_STRIPE !== 'true') {
    return { accepted: false, reason: 'live_mode_not_authorized' };
  }

  const session = event.data && event.data.object;
  if (!session || !session.id) return { accepted: false, reason: 'missing_checkout_session' };
  if (session.payment_status !== 'paid') return { accepted: false, reason: 'payment_not_paid' };

  const amountMinor = Number(session.amount_total);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return { accepted: false, reason: 'no_positive_cleared_revenue' };
  }

  const currency = String(session.currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { accepted: false, reason: 'invalid_currency' };

  const metadata = session.metadata || {};
  const paycoreIntentId = metadata.paycore_intent_id || metadata.paycore_intent || null;
  const paidAt = new Date(Number(event.created || Math.floor(Date.now() / 1000)) * 1000).toISOString();

  return {
    accepted: true,
    payment: {
      stripeEventId: String(event.id),
      eventType: String(event.type),
      checkoutSessionId: String(session.id),
      paymentIntentId: session.payment_intent ? String(session.payment_intent) : null,
      paycoreIntentId: paycoreIntentId ? String(paycoreIntentId) : null,
      amountMinor,
      currency,
      paymentStatus: String(session.payment_status),
      livemode: Boolean(event.livemode),
      paidAt,
    },
  };
}

async function processStripePaymentEvent(event, deps = {}) {
  const persist = deps.persist || paycoreStore.processVerifiedStripeSuccess;
  const normalized = normalizePayCoreSuccess(event);
  if (!normalized.accepted) return { status: 'ignored', reason: normalized.reason };
  return persist(normalized.payment);
}

function constructStripeEvent(rawBody, signature, secret, stripeClient = stripe) {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is required');
  if (!signature) throw new Error('Stripe-Signature header is required');
  return stripeClient.webhooks.constructEvent(rawBody, signature, secret);
}

router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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

    if (result.status === 'retry' || result.status === 'rejected') {
      return res.status(500).json({ received: true, status: result.status, reason: result.reason });
    }

    return res.status(200).json({ received: true, status: result.status });
  } catch (error) {
    console.error('PayCore Stripe webhook processing failed', {
      eventId: event && event.id,
      eventType: event && event.type,
      message: error && error.message,
    });
    return res.status(500).send('processing failed');
  }
});

router.all('/stripe/webhook', (req, res) => {
  res.set('Allow', 'POST');
  return res.status(405).json({ error: 'method_not_allowed' });
});

module.exports = {
  router,
  normalizePayCoreSuccess,
  processStripePaymentEvent,
  constructStripeEvent,
};

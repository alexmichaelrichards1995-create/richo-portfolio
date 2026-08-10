/* stripe_onboarding.js
 * Express routes to onboard Stripe Connect accounts and receive Stripe webhooks.
 * - POST /stripe/onboard/start  { accountId, login, email } => { connectedAccountId, onboardingUrl }
 * - POST /stripe/webhook         Stripe webhook receiver (verifies signature when STRIPE_WEBHOOK_SECRET set)
 *
 * Uses stripe_connect.createConnectAccount and stripe_connect.executePayout where appropriate.
 */

const express = require('express');
const router = express.Router();
const stripeConnect = require('./stripe_connect');
const bodyParser = require('body-parser');

// Start connect onboarding for an organization
router.post('/stripe/onboard/start', express.json(), async (req, res) => {
  try {
    const { accountId, login, email } = req.body || {};
    if (!accountId) return res.status(400).json({ error: 'accountId required' });

    const org = { accountId, login, email };
    const created = await stripeConnect.createConnectAccount(org);

    // If real Stripe, create Account Links to complete onboarding
    if (process.env.STRIPE_API_KEY && created && created.accountId && typeof created.accountId === 'string') {
      try {
        const stripe = require('stripe')(process.env.STRIPE_API_KEY);
        const accountLinks = await stripe.accountLinks.create({
          account: created.accountId,
          refresh_url: process.env.STRIPE_ONBOARDING_REFRESH_URL || 'https://your-app.example.com/stripe/onboard/refresh',
          return_url: process.env.STRIPE_ONBOARDING_RETURN_URL || 'https://your-app.example.com/stripe/onboard/complete',
          type: 'account_onboarding',
        });
        // mark onboarding started in DB if possible
        try { const db = require('./db/db_client'); await db.upsertConnectedAccount(accountId, created.accountId, 'onboarding_started'); } catch (e) { console.warn('db upsertConnectedAccount failed during onboarding', e && e.message); }
        return res.status(200).json({ connectedAccountId: created.accountId, onboardingUrl: accountLinks.url });
      } catch (err) {
        // fallback to returning the connected id and note that account-links creation failed
        try { const db = require('./db/db_client'); await db.upsertConnectedAccount(accountId, created.accountId, 'onboarding_started'); } catch (e) {}
        return res.status(200).json({ connectedAccountId: created.accountId, onboardingUrl: null, warning: 'account_links_failed' });
      }
    }

    // Fallback stub returns a fake onboarding URL
    const onboardingUrl = `https://stripe.mock/onboard/${created.accountId}`;
    try { const db = require('./db/db_client'); await db.upsertConnectedAccount(accountId, created.accountId, 'onboarding_started'); } catch (e) {}
    return res.status(200).json({ connectedAccountId: created.accountId, onboardingUrl });
  } catch (err) {
    console.error('onboard/start error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Stripe webhook receiver (lightweight)
// If STRIPE_WEBHOOK_SECRET is set, verify signature using stripe lib; otherwise accept as scaffold.
router.post('/stripe/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const raw = req.body;

  if (process.env.STRIPE_WEBHOOK_SECRET) {
    if (!process.env.STRIPE_API_KEY) {
      console.warn('STRIPE_WEBHOOK_SECRET set but no STRIPE_API_KEY — cannot verify signature');
    } else {
      try {
        const stripe = require('stripe')(process.env.STRIPE_API_KEY);
        const evt = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
        // Process event types of interest
        if (evt.type === 'account.updated' || evt.type === 'account.application.authorized') {
          const obj = evt.data && evt.data.object;
          console.log('stripe event', evt.type, obj && obj.id);
          try {
            const db = require('./db/db_client');
            const stripeAccountId = obj && obj.id;
            const existing = stripeAccountId ? await db.getConnectedAccountByStripeId(stripeAccountId) : null;
            const chargesEnabled = obj && obj.charges_enabled;
            const newStatus = chargesEnabled ? 'verified' : 'onboarding_updated';
            if (existing && existing.account_id) {
              await db.upsertConnectedAccount(existing.account_id, stripeAccountId, newStatus);
            } else {
              // No mapping found — log and skip to avoid inserting null account_id into DB
              console.log('stripe webhook: no local mapping for stripe account', stripeAccountId);
            }
          } catch (e) { console.warn('failed updating connected account status', e && e.message); }
        }
        return res.status(200).send('ok');
      } catch (err) {
        console.warn('stripe webhook verification failed', err && err.message);
        return res.status(400).send('invalid_signature');
      }
    }
  }

  // No verification configured: parse JSON body and acknowledge
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    console.log('stripe webhook (scaffold) received', parsed && parsed.type);
    return res.status(200).send('ok');
  } catch (err) {
    return res.status(400).send('bad_request');
  }
});

module.exports = { router };

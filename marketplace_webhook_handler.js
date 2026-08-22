/* marketplace_webhook_handler.js
 * Express-compatible marketplace webhook handler for GitHub Marketplace purchase events.
 * Security posture:
 * - Fails closed when GITHUB_WEBHOOK_SECRET is not configured.
 * - Verifies X-Hub-Signature-256 with constant-time comparison.
 * - Does not acknowledge a delivery until processing and idempotency persistence finish.
 * - Prevents duplicate processing for the same delivery inside one running process.
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const HANDLED_DIR = path.join(__dirname, 'data');
const HANDLED_FILE = path.join(HANDLED_DIR, 'handled_deliveries.json');
const inFlightDeliveries = new Set();

function getWebhookSecret() {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  return typeof secret === 'string' && secret.length > 0 ? secret : null;
}

function verifySignature(req, _res, buf) {
  // express.json() invokes this before parsing. Preserve the exact raw bytes used
  // by GitHub when computing X-Hub-Signature-256.
  req.rawBody = Buffer.from(buf);
}

function requireValidSignature(req, res, next) {
  const secret = getWebhookSecret();
  if (!secret) return res.status(503).send('Webhook secret not configured');

  const signature = req.get('x-hub-signature-256');
  if (!signature || !req.rawBody) return res.status(400).send('Missing signature');
  if (!signature.startsWith('sha256=')) return res.status(401).send('Invalid signature');

  const digest = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
  const expected = Buffer.from(digest, 'utf8');
  const received = Buffer.from(signature, 'utf8');

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return res.status(401).send('Invalid signature');
  }

  next();
}

async function ensureHandledStore() {
  await fs.promises.mkdir(HANDLED_DIR, { recursive: true });
  try {
    await fs.promises.access(HANDLED_FILE);
  } catch {
    await fs.promises.writeFile(HANDLED_FILE, JSON.stringify({}), 'utf8');
  }
}

async function readHandled() {
  await ensureHandledStore();
  const raw = await fs.promises.readFile(HANDLED_FILE, 'utf8');
  return JSON.parse(raw || '{}');
}

async function markHandled(deliveryId) {
  const handled = await readHandled();
  handled[deliveryId] = Date.now();
  await fs.promises.writeFile(HANDLED_FILE, JSON.stringify(handled, null, 2), 'utf8');
}

async function clearHandledForTests() {
  await ensureHandledStore();
  await fs.promises.writeFile(HANDLED_FILE, JSON.stringify({}, null, 2), 'utf8');
  inFlightDeliveries.clear();
}

async function processMarketplaceEvent(event, deliveryId) {
  if (!deliveryId) throw new Error('missing deliveryId');

  const handled = await readHandled();
  if (handled[deliveryId] || inFlightDeliveries.has(deliveryId)) {
    return { skipped: true };
  }

  inFlightDeliveries.add(deliveryId);
  try {
    const action = event.action;
    const purchase = event.marketplace_purchase;
    if (!purchase) throw new Error('no marketplace_purchase');

    const account = purchase.account || {};
    const plan = purchase.plan || {};
    const accountId = account.id;
    if (!accountId) throw new Error('marketplace account id missing');

    const planWithAccount = { ...plan, account_login: account.login || null };

    switch (action) {
      case 'purchased':
        await createOrUpgradeSubscription(accountId, plan.id, planWithAccount);
        break;
      case 'changed':
        await updateSubscription(accountId, plan.id, planWithAccount);
        break;
      case 'cancelled':
        await downgradeSubscription(accountId);
        break;
      default:
        break;
    }

    // Persist idempotency evidence before acknowledging the HTTP request.
    await markHandled(deliveryId);
    return { processed: true };
  } finally {
    inFlightDeliveries.delete(deliveryId);
  }
}

router.post('/marketplace', express.json({ verify: verifySignature }), requireValidSignature, async (req, res) => {
  try {
    const deliveryId = req.get('x-github-delivery');
    if (!deliveryId) return res.status(400).send('Missing delivery id');

    await processMarketplaceEvent(req.body, deliveryId);
    return res.status(200).send('ok');
  } catch (err) {
    console.error('marketplace webhook processing error', err && err.message);
    return res.status(500).send('server error');
  }
});

const subscriptionsService = require('./subscriptions_service');
const stripeConnect = require('./stripe_connect');

async function createOrUpgradeSubscription(accountId, planId, plan) {
  const result = await subscriptionsService.upsertSubscription(accountId, {
    id: planId,
    name: plan.name,
    monthly_price_in_cents: plan.monthly_price_in_cents,
    account_login: plan.account_login,
  });

  // A Marketplace purchase must not fabricate a connected Stripe account. If
  // Stripe is not configured, createConnectAccount returns an explicit
  // unconfigured result and provisioning remains non-live.
  try {
    const org = { accountId, login: plan.account_login || 'unknown' };
    const connectRes = await stripeConnect.createConnectAccount(org);
    if (connectRes && connectRes.connected && connectRes.accountId) {
      console.log('Stripe Connect account available for marketplace account', accountId);
    }
  } catch (e) {
    console.warn('createConnectAccount error', e && e.message);
  }

  return result;
}

async function updateSubscription(accountId, planId, plan) {
  return subscriptionsService.upsertSubscription(accountId, {
    id: planId,
    name: plan.name,
    monthly_price_in_cents: plan.monthly_price_in_cents,
    account_login: plan.account_login,
  });
}

async function downgradeSubscription(accountId) {
  try {
    const sub = await subscriptionsService.getSubscription(accountId);
    if (sub && (sub.account_id || sub.accountId)) {
      const db = require('./db/db_client');
      await db.upsertSubscription(accountId, { ...sub, status: 'scheduled_downgrade' });
    }
  } catch (e) {
    console.warn('downgradeSubscription error', e && e.message);
    throw e;
  }
}

module.exports = {
  router,
  processMarketplaceEvent,
  clearHandledForTests,
  requireValidSignature,
};

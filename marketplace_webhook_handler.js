/* marketplace_webhook_handler.js
 * Express-compatible marketplace webhook handler for GitHub Marketplace purchase events.
 * - Verifies X-Hub-Signature-256 HMAC
 * - Rejects insecure/default webhook configuration
 * - Bounds JSON payload size
 * - Requires delivery IDs and supported Marketplace actions
 * - Idempotent processing using delivery GUID tracking (file-backed for scaffold)
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
const MAX_WEBHOOK_BYTES = process.env.MAX_WEBHOOK_BYTES || '256kb';
const HANDLED_DIR = path.join(__dirname, 'data');
const HANDLED_FILE = path.join(HANDLED_DIR, 'handled_deliveries.json');
const SUPPORTED_ACTIONS = new Set(['purchased', 'changed', 'cancelled']);

function verifySignature(req, res, buf) {
  req.rawBody = Buffer.from(buf);
}

function requireValidSignature(req, res, next) {
  if (!WEBHOOK_SECRET || WEBHOOK_SECRET === 'replace-me') {
    return res.status(503).send('Webhook verification unavailable');
  }

  const sig = req.get('x-hub-signature-256');
  if (!sig || !req.rawBody) return res.status(400).send('Missing signature');
  if (!/^sha256=[0-9a-f]{64}$/i.test(sig)) return res.status(401).send('Invalid signature');

  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(req.rawBody);
  const digest = `sha256=${hmac.digest('hex')}`;

  const expected = Buffer.from(digest, 'utf8');
  const supplied = Buffer.from(sig, 'utf8');
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return res.status(401).send('Invalid signature');
  }
  next();
}

function requireValidMarketplaceEnvelope(req, res, next) {
  const deliveryId = req.get('x-github-delivery');
  if (!deliveryId || deliveryId.length > 200) return res.status(400).send('Missing or invalid delivery ID');
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).send('Invalid payload');
  if (!SUPPORTED_ACTIONS.has(req.body.action)) return res.status(202).send('ignored');

  const purchase = req.body.marketplace_purchase;
  if (!purchase || typeof purchase !== 'object') return res.status(400).send('Invalid marketplace purchase');
  if (!purchase.account || !Number.isSafeInteger(Number(purchase.account.id)) || Number(purchase.account.id) <= 0) {
    return res.status(400).send('Invalid account');
  }
  if (req.body.action !== 'cancelled') {
    if (!purchase.plan || !Number.isSafeInteger(Number(purchase.plan.id)) || Number(purchase.plan.id) <= 0) {
      return res.status(400).send('Invalid plan');
    }
  }
  next();
}

async function ensureHandledStore() {
  await fs.promises.mkdir(HANDLED_DIR, { recursive: true });
  try {
    await fs.promises.access(HANDLED_FILE);
  } catch (e) {
    await fs.promises.writeFile(HANDLED_FILE, JSON.stringify({}), { encoding: 'utf8', mode: 0o600 });
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
  const tmp = `${HANDLED_FILE}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(handled, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.promises.rename(tmp, HANDLED_FILE);
}

async function clearHandledForTests() {
  await ensureHandledStore();
  await fs.promises.writeFile(HANDLED_FILE, JSON.stringify({}, null, 2), { encoding: 'utf8', mode: 0o600 });
}

async function processMarketplaceEvent(event, deliveryId) {
  if (!deliveryId) throw new Error('missing deliveryId');
  const handled = await readHandled();
  if (handled[deliveryId]) return { skipped: true };

  const action = event.action;
  const purchase = event.marketplace_purchase;
  if (!purchase) throw new Error('no marketplace_purchase');

  const account = purchase.account || {};
  const plan = purchase.plan || {};
  const accountId = account.id;

  switch (action) {
    case 'purchased':
      await createOrUpgradeSubscription(accountId, plan.id, plan);
      break;
    case 'changed':
      await updateSubscription(accountId, plan.id, plan);
      break;
    case 'cancelled':
      await downgradeSubscription(accountId);
      break;
    default:
      return { ignored: true };
  }

  await markHandled(deliveryId);
  return { processed: true };
}

router.post(
  '/marketplace',
  express.json({ verify: verifySignature, limit: MAX_WEBHOOK_BYTES, type: 'application/json' }),
  requireValidSignature,
  requireValidMarketplaceEnvelope,
  async (req, res) => {
    try {
      const deliveryId = req.get('x-github-delivery');
      processMarketplaceEvent(req.body, deliveryId).catch(err => console.error('async marketplace processing failed'));
      res.status(200).send('ok');
    } catch (err) {
      console.error('marketplace webhook error');
      res.status(500).send('server error');
    }
  }
);

const subscriptionsService = require('./subscriptions_service');
const stripeConnect = require('./stripe_connect');

async function createOrUpgradeSubscription(accountId, planId, plan) {
  const result = await subscriptionsService.upsertSubscription(accountId, {
    id: planId,
    name: plan.name,
    monthly_price_in_cents: plan.monthly_price_in_cents,
    account_login: plan.account_login
  });

  try {
    const org = { accountId, login: (plan.account_login || 'unknown') };
    const connectRes = await stripeConnect.createConnectAccount(org).catch(() => null);
    if (connectRes && connectRes.accountId) console.log('Stripe Connect account provisioned');
  } catch (e) {
    console.warn('Stripe Connect provisioning deferred');
  }
  return result;
}

async function updateSubscription(accountId, planId, plan) {
  return subscriptionsService.upsertSubscription(accountId, {
    id: planId,
    name: plan.name,
    monthly_price_in_cents: plan.monthly_price_in_cents
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
    console.warn('Subscription downgrade deferred');
  }
}

module.exports = { router, processMarketplaceEvent, clearHandledForTests };

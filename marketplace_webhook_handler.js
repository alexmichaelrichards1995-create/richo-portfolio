/* marketplace_webhook_handler.js
 * Express-compatible marketplace webhook handler for GitHub Marketplace purchase events.
 * - Verifies X-Hub-Signature-256 HMAC
 * - Idempotent processing using delivery GUID tracking (file-backed for scaffold)
 * - Exposes processMarketplaceEvent for unit testing
 *
 * Integrate: const {router} = require('./marketplace_webhook_handler'); app.use('/webhooks', router);
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Load from env: GITHUB_WEBHOOK_SECRET
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'replace-me';
const HANDLED_DIR = path.join(__dirname, 'data');
const HANDLED_FILE = path.join(HANDLED_DIR, 'handled_deliveries.json');

function verifySignature(req, res, buf, encoding) {
  // express.json() body parser should be configured with this verify to retain raw body
  if (!WEBHOOK_SECRET) return;
  req.rawBody = buf;
}

// Middleware to verify signature header
function requireValidSignature(req, res, next) {
  const sig = req.get('x-hub-signature-256');
  if (!sig || !req.rawBody) return res.status(400).send('Missing signature');

  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(req.rawBody);
  const digest = `sha256=${hmac.digest('hex')}`;

  // Constant-time compare
  try {
    if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig))) {
      return res.status(401).send('Invalid signature');
    }
  } catch (e) {
    return res.status(401).send('Invalid signature');
  }
  next();
}

// Ensure data dir exists
async function ensureHandledStore() {
  try {
    await fs.promises.mkdir(HANDLED_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
  try {
    await fs.promises.access(HANDLED_FILE);
  } catch (e) {
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
}

// Core processing function exported for tests
async function processMarketplaceEvent(event, deliveryId) {
  if (!deliveryId) throw new Error('missing deliveryId');
  const handled = await readHandled();
  if (handled[deliveryId]) {
    return { skipped: true };
  }

  const action = event.action;
  const purchase = event.marketplace_purchase;
  if (!purchase) throw new Error('no marketplace_purchase');

  const account = purchase.account || {};
  const plan = purchase.plan || {};
  const accountId = account.id;

  // Dispatch
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
      // ignore others
      break;
  }

  // mark delivery handled (idempotency)
  await markHandled(deliveryId);
  return { processed: true };
}

// Main handler
router.post('/marketplace', express.json({ verify: verifySignature }), requireValidSignature, async (req, res) => {
  try {
    const deliveryId = req.get('x-github-delivery');
    // Fire-and-forget processing to respond quickly
    processMarketplaceEvent(req.body, deliveryId).catch(err => console.error('async processing error', err));
    res.status(200).send('ok');
  } catch (err) {
    console.error('marketplace webhook error', err);
    res.status(500).send('server error');
  }
});

// -- Provisioning / billing stubs -- replace with DB/service calls and idempotency checks
async function createOrUpgradeSubscription(accountId, planId, plan) {
  // Idempotent: check if subscription exists and plan already applied
  // Persist subscription metadata: accountId, planId, price_in_cents, started_at
  console.log('createOrUpgradeSubscription', { accountId, planId, plan });
  // TODO: implement DB upsert and feature flag toggles
}

async function updateSubscription(accountId, planId, plan) {
  // Apply upgrades/downgrades within billing cycle
  console.log('updateSubscription', { accountId, planId, plan });
  // TODO: implement proration or scheduled change depending on rules
}

async function downgradeSubscription(accountId) {
  // Schedule downgrade at end of billing cycle; preserve historical data
  console.log('downgradeSubscription', { accountId });
  // TODO: implement scheduling and feature revocation
}

module.exports = { router, processMarketplaceEvent, clearHandledForTests };

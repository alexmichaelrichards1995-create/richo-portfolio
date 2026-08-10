/* marketplace_webhook_handler.js
 * Minimal Express-compatible webhook handler for GitHub Marketplace purchase events.
 * - Verifies X-Hub-Signature-256 HMAC
 * - Parses action and marketplace_purchase payload
 * - Dispatches to idempotent provisioning/billing handlers (stubs)
 *
 * Integrate: const {router} = require('./marketplace_webhook_handler'); app.use('/webhooks', router);
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Load from env: GITHUB_WEBHOOK_SECRET
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'replace-me';

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
  if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig))) {
    return res.status(401).send('Invalid signature');
  }
  next();
}

// Main handler
router.post('/marketplace', express.json({ verify: verifySignature }), requireValidSignature, async (req, res) => {
  try {
    const event = req.body;
    const action = event.action;
    const purchase = event.marketplace_purchase;
    if (!purchase) return res.status(400).send('No marketplace_purchase');

    const account = purchase.account || {};
    const plan = purchase.plan || {};
    const accountId = account.id;

    // TODO: idempotency -- use delivery GUID or marketplace purchase id if available
    // Example: const deliveryId = req.get('x-github-delivery');

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
        // ignore other actions
        break;
    }

    // Always respond 200 quickly to avoid redelivery storms; do heavy work async if needed.
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

module.exports = { router };

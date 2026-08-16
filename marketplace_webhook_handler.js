/* marketplace_webhook_handler.js
 * Express-compatible marketplace webhook handler for GitHub Marketplace purchase events.
 * - Verifies X-Hub-Signature-256 HMAC
 * - Idempotent processing using atomic delivery claims (file-backed for scaffold)
 * - Exposes processMarketplaceEvent for unit testing
 *
 * Integrate: const {router} = require('./marketplace_webhook_handler'); app.use('/webhooks', router);
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Never provide a predictable fallback for webhook authentication.
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
const HANDLED_DIR = path.join(__dirname, 'data', 'handled_deliveries');

function verifySignature(req, res, buf, encoding) {
  // express.json() body parser should be configured with this verify to retain raw body.
  req.rawBody = buf;
}

function requireValidSignature(req, res, next) {
  if (!WEBHOOK_SECRET) return res.status(503).send('Webhook authentication is not configured');

  const sig = req.get('x-hub-signature-256');
  if (!sig || !req.rawBody) return res.status(400).send('Missing signature');

  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(req.rawBody);
  const digest = `sha256=${hmac.digest('hex')}`;

  try {
    if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig))) {
      return res.status(401).send('Invalid signature');
    }
  } catch (e) {
    return res.status(401).send('Invalid signature');
  }
  next();
}

async function ensureHandledStore() {
  await fs.promises.mkdir(HANDLED_DIR, { recursive: true });
}

function deliveryMarkerPath(deliveryId) {
  const key = crypto.createHash('sha256').update(String(deliveryId)).digest('hex');
  return path.join(HANDLED_DIR, `${key}.json`);
}

async function claimDelivery(deliveryId) {
  await ensureHandledStore();
  const marker = deliveryMarkerPath(deliveryId);
  try {
    const handle = await fs.promises.open(marker, 'wx');
    try {
      await handle.writeFile(JSON.stringify({ deliveryId, claimedAt: Date.now() }), 'utf8');
    } finally {
      await handle.close();
    }
    return { claimed: true, marker };
  } catch (error) {
    if (error && error.code === 'EEXIST') return { claimed: false, marker };
    throw error;
  }
}

async function releaseDelivery(marker) {
  try {
    await fs.promises.unlink(marker);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
}

async function clearHandledForTests() {
  await fs.promises.rm(HANDLED_DIR, { recursive: true, force: true });
  await ensureHandledStore();
}

async function processMarketplaceEvent(event, deliveryId) {
  if (!deliveryId) throw new Error('missing deliveryId');

  const claim = await claimDelivery(deliveryId);
  if (!claim.claimed) return { skipped: true };

  try {
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
        break;
    }

    return { processed: true };
  } catch (error) {
    // Failed deliveries must remain retryable.
    await releaseDelivery(claim.marker);
    throw error;
  }
}

router.post('/marketplace', express.json({ verify: verifySignature }), requireValidSignature, async (req, res) => {
  try {
    const deliveryId = req.get('x-github-delivery');
    const result = await processMarketplaceEvent(req.body, deliveryId);
    res.status(result.skipped ? 200 : 202).send(result.skipped ? 'duplicate' : 'accepted');
  } catch (err) {
    console.error('marketplace webhook error', err);
    res.status(500).send('server error');
  }
});

// -- Provisioning / billing stubs -- replace with DB/service calls and idempotency checks
const subscriptionsService = require('./subscriptions_service');
const stripeConnect = require('./stripe_connect');

async function createOrUpgradeSubscription(accountId, planId, plan) {
  console.log('createOrUpgradeSubscription', { accountId, planId, plan });
  const result = await subscriptionsService.upsertSubscription(accountId, { id: planId, name: plan.name, monthly_price_in_cents: plan.monthly_price_in_cents, account_login: plan.account_login });

  try {
    const org = { accountId, login: (plan.account_login || 'unknown') };
    const connectRes = await stripeConnect.createConnectAccount(org).catch(e => { console.warn('stripe createConnectAccount failed', e && e.message); return null; });
    if (connectRes && connectRes.accountId) {
      console.log('Connected Stripe account', connectRes.accountId);
    }
  } catch (e) {
    console.warn('createConnectAccount error', e && e.message);
  }

  return result;
}

async function updateSubscription(accountId, planId, plan) {
  console.log('updateSubscription', { accountId, planId, plan });
  return subscriptionsService.upsertSubscription(accountId, { id: planId, name: plan.name, monthly_price_in_cents: plan.monthly_price_in_cents });
}

async function downgradeSubscription(accountId) {
  console.log('downgradeSubscription', { accountId });
  try {
    const sub = await subscriptionsService.getSubscription(accountId);
    if (sub && sub.account_id) {
      const db = require('./db/db_client');
      await db.upsertSubscription(accountId, { ...sub, status: 'scheduled_downgrade' });
    } else if (sub && sub.accountId) {
      const db = require('./db/db_client');
      await db.upsertSubscription(accountId, { ...sub, status: 'scheduled_downgrade' });
    }
  } catch (e) {
    console.warn('downgradeSubscription error', e && e.message);
  }
}

module.exports = { router, processMarketplaceEvent, clearHandledForTests };

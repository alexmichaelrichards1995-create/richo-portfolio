/* marketplace_webhook_handler.js
 * Express-compatible marketplace webhook handler.
 * - Verifies X-Hub-Signature-256 HMAC
 * - Durable idempotency via database webhook_deliveries table
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const subscriptionsService = require('./subscriptions_service');
const dbClient = require('./db/db_client');

function log(level, message, detail = {}) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level, message, ...detail })}\n`);
}

function webhookSecret() {
  const value = process.env.GITHUB_WEBHOOK_SECRET;
  if (!value) {
    const error = new Error('GITHUB_WEBHOOK_SECRET is required');
    error.code = 'CONFIG_REQUIRED';
    throw error;
  }
  return value;
}

function verifySignature(req, res, buf) {
  req.rawBody = buf;
}

function requireValidSignature(req, res, next) {
  let secret;
  try {
    secret = webhookSecret();
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }

  const sig = req.get('x-hub-signature-256');
  if (!sig || !req.rawBody) return res.status(400).json({ error: 'Missing signature' });

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(req.rawBody);
  const digest = `sha256=${hmac.digest('hex')}`;

  try {
    const actual = Buffer.from(digest);
    const provided = Buffer.from(sig);
    if (actual.length !== provided.length || !crypto.timingSafeEqual(actual, provided)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (e) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}

async function processMarketplaceEvent(event, deliveryId) {
  if (!deliveryId) throw new Error('missing deliveryId');
  if (!event || !event.marketplace_purchase) throw new Error('no marketplace_purchase');
  if (!dbClient.hasDatabase()) throw new Error('DATABASE_URL is required for marketplace webhook processing');

  const action = event.action;
  const purchase = event.marketplace_purchase;
  const account = purchase.account || {};
  if (!account.id) throw new Error('marketplace account id is required');

  return dbClient.withTransaction(async (client) => {
    const firstSeen = await dbClient.reserveWebhookDelivery(client, deliveryId, 'marketplace_purchase', action, event);
    if (!firstSeen) {
      log('info', 'marketplace webhook duplicate', { delivery_id: deliveryId, action, account_id: account.id });
      return { skipped: true };
    }

    try {
      switch (action) {
        case 'purchased':
        case 'changed':
        case 'cancelled':
          await subscriptionsService.upsertSubscription(account.id, purchase, action, { client });
          break;
        default:
          break;
      }

      await dbClient.markWebhookDeliveryProcessed(client, deliveryId);
      log('info', 'marketplace webhook processed', { delivery_id: deliveryId, action, account_id: account.id });
      return { processed: true };
    } catch (error) {
      await dbClient.markWebhookDeliveryFailed(client, deliveryId, error.message);
      log('error', 'marketplace webhook failed', { delivery_id: deliveryId, action, account_id: account.id, error: error.message });
      throw error;
    }
  });
}

async function clearHandledForTests() {
  await dbClient.clearWebhookDeliveriesForTests();
}

router.post('/marketplace', express.json({ verify: verifySignature }), requireValidSignature, async (req, res) => {
  try {
    const deliveryId = req.get('x-github-delivery');
    const result = await processMarketplaceEvent(req.body, deliveryId);
    res.status(202).json({ accepted: true, duplicate: Boolean(result && result.skipped) });
  } catch (err) {
    log('error', 'marketplace webhook error', { error: err.message, delivery_id: req.get('x-github-delivery') || null });
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = { router, processMarketplaceEvent, clearHandledForTests };

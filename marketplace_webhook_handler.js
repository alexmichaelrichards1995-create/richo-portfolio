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
      // Transactional processing: check delivery table + upsert subscription within a DB transaction when Postgres enabled
      if (deliveryId && require('./db/db_client').pgPool) {
        // run transactional flow synchronously to avoid duplicates
        try {
          const db = require('./db/db_client');
          const client = await db.pgPool.connect();
          try {
            await client.query('BEGIN');
            const exists = await client.query('SELECT processed FROM deliveries WHERE delivery_id = $1 FOR UPDATE', [deliveryId]);
            if (exists.rows.length && exists.rows[0].processed) {
              await client.query('ROLLBACK');
              res.status(200).send('ok');
              return;
            }

            // insert or update delivery as processed
            await client.query("INSERT INTO deliveries(delivery_id, processed, processed_at) VALUES ($1, true, now()) ON CONFLICT (delivery_id) DO UPDATE SET processed = true, processed_at = now()", [deliveryId]);

            // process event
            await processMarketplaceEvent(req.body, deliveryId);

            await client.query('COMMIT');
            res.status(200).send('ok');
            return;
          } catch (e) {
            await client.query('ROLLBACK').catch(()=>{});
            console.error('transactional processing error', e && e.message);
            res.status(500).send('server error');
            return;
          } finally {
            client.release();
          }
        } catch (e) {
          console.error('db transactional flow failed', e && e.message);
          // fallback to async processing
          processMarketplaceEvent(req.body, deliveryId).catch(err => console.error('async processing error', err));
          res.status(200).send('ok');
          return;
        }
      }

      // Fire-and-forget processing to respond quickly (fallback)
      processMarketplaceEvent(req.body, deliveryId).catch(err => console.error('async processing error', err));
      res.status(200).send('ok');
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
  // Upsert subscription in DB
  const result = await subscriptionsService.upsertSubscription(accountId, { id: planId, name: plan.name, monthly_price_in_cents: plan.monthly_price_in_cents, account_login: plan.account_login });

  // Ensure a Stripe Connect account exists for enterprise (deferred for free tier)
  try {
    const org = { accountId, login: (plan.account_login || 'unknown') };
    const connectRes = await stripeConnect.createConnectAccount(org).catch(e => { console.warn('stripe createConnectAccount failed', e && e.message); return null; });
    if (connectRes && connectRes.accountId) {
      // Persist connected account ID alongside subscription if using file store, best-effort
      // Ideally subscriptionsService would handle mapping; here we log for visibility
      console.log('Connected Stripe account', connectRes.accountId);
    }
  } catch (e) {
    console.warn('createConnectAccount error', e && e.message);
  }

  return result;
}

async function updateSubscription(accountId, planId, plan) {
  console.log('updateSubscription', { accountId, planId, plan });
  // For now, reuse upsert to apply plan changes (idempotent). In future implement proration.
  return subscriptionsService.upsertSubscription(accountId, { id: planId, name: plan.name, monthly_price_in_cents: plan.monthly_price_in_cents });
}

async function downgradeSubscription(accountId) {
  console.log('downgradeSubscription', { accountId });
  // Mark subscription as scheduled_downgrade
  try {
    const sub = await subscriptionsService.getSubscription(accountId);
    if (sub && sub.account_id) {
      // If using DB row, perform update via db client directly
      const db = require('./db/db_client');
      await db.upsertSubscription(accountId, { ...sub, status: 'scheduled_downgrade' });
    } else if (sub && sub.accountId) {
      // file-store shape
      const db = require('./db/db_client');
      await db.upsertSubscription(accountId, { ...sub, status: 'scheduled_downgrade' });
    }
  } catch (e) {
    console.warn('downgradeSubscription error', e && e.message);
  }
}

module.exports = { router, processMarketplaceEvent, clearHandledForTests };

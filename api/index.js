'use strict';

const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const { router: stripePaymentRouter } = require('../stripe_payment_webhook');
const { syncPayCoreRevenueFromEnvironment } = require('../paycore_revenue_bridge');
const { startCheckout } = require('../paycore_checkout');
const { OFFERS, publicOffer } = require('../paycore_offer_catalog');

const app = express();
app.disable('x-powered-by');

function noStore(res) {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
}

function explicitBoolean(value) {
  return value === 'true' || value === 'false';
}

function configurationState() {
  return {
    database: Boolean(process.env.DATABASE_URL),
    stripeApi: Boolean(process.env.STRIPE_API_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    checkoutBaseUrl: Boolean(process.env.CHECKOUT_BASE_URL),
    gstRegistrationDeclared: explicitBoolean(process.env.AU_GST_REGISTERED),
    posthog: Boolean(process.env.POSTHOG_PROJECT_TOKEN),
    posthogHost: process.env.POSTHOG_HOST ? 'configured' : 'default',
    revenueSync: Boolean(process.env.REVENUE_SYNC_TOKEN),
    liveStripeAuthorized: process.env.ALLOW_LIVE_STRIPE === 'true',
  };
}

function bearerMatches(request, expectedToken) {
  if (!expectedToken) return false;
  const header = String(request.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(String(expectedToken));
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function checkoutErrorResponse(error) {
  switch (error && error.code) {
    case 'UNKNOWN_SKU': return { status: 404, body: { error: 'unknown_sku' } };
    case 'INVALID_IDEMPOTENCY_KEY': return { status: 400, body: { error: 'invalid_idempotency_key' } };
    case 'IDEMPOTENCY_CONFLICT': return { status: 409, body: { error: 'idempotency_conflict' } };
    case 'GST_CONFIGURATION_REQUIRED':
    case 'CHECKOUT_CONFIGURATION_ERROR':
    case 'LIVE_STRIPE_NOT_AUTHORIZED':
      return { status: 503, body: { error: 'checkout_not_configured' } };
    default: return { status: 502, body: { error: 'checkout_unavailable' } };
  }
}

// IMPORTANT: Mount the Stripe router before any JSON/body parser. The router
// uses express.raw() so Stripe signature verification receives the exact bytes.
app.use('/api', stripePaymentRouter);
app.use('/', stripePaymentRouter);

app.get(['/api/health', '/health'], (req, res) => {
  noStore(res);
  return res.status(200).json({
    status: 'alive',
    service: 'richo-paycore-revenue-intake',
    version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
    configured: configurationState(),
  });
});

app.get('/api/offers', (req, res) => {
  noStore(res);
  return res.status(200).json({
    currency: 'AUD',
    offers: OFFERS.map(publicOffer),
  });
});

app.post('/api/checkout/:sku', async (req, res) => {
  noStore(res);
  try {
    const result = await startCheckout({
      sku: req.params.sku,
      idempotencyKey: req.get('idempotency-key'),
    });

    return res.status(result.reused ? 200 : 201).json({
      status: result.status,
      intentId: result.intentId,
      orderReference: result.orderReference,
      sessionId: result.sessionId,
      checkoutUrl: result.checkoutUrl,
      expiresAt: result.expiresAt,
      sku: result.offer.sku,
      amountMinor: result.price.amountMinor,
      currency: result.offer.currency,
      stripeMode: result.stripeMode,
    });
  } catch (error) {
    const mapped = checkoutErrorResponse(error);
    if (mapped.status >= 500) {
      console.error('PayCore checkout creation failed', {
        code: error && error.code ? String(error.code) : 'unknown',
      });
    }
    return res.status(mapped.status).json(mapped.body);
  }
});

app.all('/api/checkout/:sku', (req, res) => {
  noStore(res);
  res.set('Allow', 'POST');
  return res.status(405).json({ error: 'method_not_allowed' });
});

app.get(['/api/ready', '/ready'], async (req, res) => {
  noStore(res);

  const configured = configurationState();
  const missing = [];
  if (!configured.database) missing.push('DATABASE_URL');
  if (!configured.stripeApi) missing.push('STRIPE_API_KEY');
  if (!configured.stripeWebhook) missing.push('STRIPE_WEBHOOK_SECRET');
  if (!configured.checkoutBaseUrl) missing.push('CHECKOUT_BASE_URL');
  if (!configured.gstRegistrationDeclared) missing.push('AU_GST_REGISTERED');
  if (!configured.posthog) missing.push('POSTHOG_PROJECT_TOKEN');
  if (!configured.revenueSync) missing.push('REVENUE_SYNC_TOKEN');

  if (missing.length) {
    return res.status(503).json({
      status: 'not_ready',
      service: 'richo-paycore-revenue-intake',
      missing,
    });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 1000,
  });

  try {
    const result = await pool.query(`
      SELECT
        to_regclass('public.payment_intents') AS payment_intents,
        to_regclass('public.payment_attempts') AS payment_attempts,
        to_regclass('public.webhook_receipts') AS webhook_receipts,
        to_regclass('public.paycore_kv') AS paycore_kv,
        to_regclass('public.idempotency_records') AS idempotency_records
    `);
    const row = result.rows[0] || {};
    const missingTables = [];
    for (const name of [
      'payment_intents',
      'payment_attempts',
      'webhook_receipts',
      'paycore_kv',
      'idempotency_records',
    ]) {
      if (!row[name]) missingTables.push(name);
    }

    if (missingTables.length) {
      return res.status(503).json({
        status: 'not_ready',
        service: 'richo-paycore-revenue-intake',
        database: 'reachable',
        missingTables,
      });
    }

    return res.status(200).json({
      status: 'ready',
      service: 'richo-paycore-revenue-intake',
      database: 'reachable',
      schema: 'paycore-compatible',
      checkout: 'configured',
      liveStripeAuthorized: configured.liveStripeAuthorized,
    });
  } catch (error) {
    console.error('PayCore readiness database check failed', {
      message: error && error.message,
    });
    return res.status(503).json({
      status: 'not_ready',
      service: 'richo-paycore-revenue-intake',
      database: 'unreachable',
    });
  } finally {
    await pool.end().catch(() => {});
  }
});

app.post('/api/revenue-sync', async (req, res) => {
  noStore(res);
  const syncToken = process.env.REVENUE_SYNC_TOKEN;
  if (!syncToken) return res.status(503).json({ error: 'revenue_sync_disabled' });
  if (!bearerMatches(req, syncToken)) return res.status(401).json({ error: 'unauthorized' });

  const requestedLimit = Number(req.query.limit || 100);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.floor(requestedLimit), 100)) : 100;

  try {
    const result = await syncPayCoreRevenueFromEnvironment({
      limit,
      onError: error => console.error('PayCore revenue analytics delivery failed', { message: error && error.message }),
    });
    return res.status(result.failed ? 207 : 200).json({ status: 'complete', ...result });
  } catch (error) {
    console.error('PayCore revenue sync failed', { message: error && error.message });
    return res.status(503).json({ error: 'revenue_sync_unavailable' });
  }
});

app.use('/api', (req, res) => {
  noStore(res);
  return res.status(404).json({ error: 'not_found' });
});

module.exports = app;

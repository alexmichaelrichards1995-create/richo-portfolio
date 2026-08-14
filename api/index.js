'use strict';

const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const { router: stripePaymentRouter } = require('../stripe_payment_webhook');
const { syncPayCoreRevenueFromEnvironment } = require('../paycore_revenue_bridge');

const app = express();
app.disable('x-powered-by');

function noStore(res) {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
}

function configurationState() {
  return {
    database: Boolean(process.env.DATABASE_URL),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    posthog: Boolean(process.env.POSTHOG_PROJECT_TOKEN),
    posthogHost: process.env.POSTHOG_HOST ? 'configured' : 'default',
    revenueSync: Boolean(process.env.REVENUE_SYNC_TOKEN),
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

// IMPORTANT: Mount the Stripe router before any JSON/body parser. The router
// uses express.raw() so Stripe signature verification receives the exact bytes.
app.use('/api', stripePaymentRouter);
app.use('/', stripePaymentRouter);

app.get(['/api/health', '/health'], (req, res) => {
  noStore(res);
  return res.status(200).json({
    status: 'alive',
    service: 'richo-revenue-webhook',
    version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
    configured: configurationState(),
  });
});

app.get(['/api/ready', '/ready'], async (req, res) => {
  noStore(res);

  const configured = configurationState();
  const missing = [];
  if (!configured.database) missing.push('DATABASE_URL');
  if (!configured.stripeWebhook) missing.push('STRIPE_WEBHOOK_SECRET');
  if (!configured.posthog) missing.push('POSTHOG_PROJECT_TOKEN');
  if (!configured.revenueSync) missing.push('REVENUE_SYNC_TOKEN');

  if (missing.length) {
    return res.status(503).json({
      status: 'not_ready',
      service: 'richo-revenue-webhook',
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
        to_regclass('public.paycore_kv') AS paycore_kv
    `);
    const row = result.rows[0] || {};
    const missingTables = [];
    if (!row.payment_intents) missingTables.push('payment_intents');
    if (!row.paycore_kv) missingTables.push('paycore_kv');

    if (missingTables.length) {
      return res.status(503).json({
        status: 'not_ready',
        service: 'richo-revenue-webhook',
        database: 'reachable',
        missingTables,
      });
    }

    return res.status(200).json({
      status: 'ready',
      service: 'richo-revenue-webhook',
      database: 'reachable',
      schema: 'compatible',
    });
  } catch (error) {
    console.error('revenue readiness database check failed', {
      message: error && error.message,
    });
    return res.status(503).json({
      status: 'not_ready',
      service: 'richo-revenue-webhook',
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
      onError: error => console.error('paycore revenue analytics delivery failed', { message: error && error.message }),
    });
    return res.status(result.failed ? 207 : 200).json({ status: 'complete', ...result });
  } catch (error) {
    console.error('paycore revenue sync failed', { message: error && error.message });
    return res.status(503).json({ error: 'revenue_sync_unavailable' });
  }
});

app.use('/api', (req, res) => {
  noStore(res);
  return res.status(404).json({ error: 'not_found' });
});

module.exports = app;

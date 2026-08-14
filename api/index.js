'use strict';

const express = require('express');
const { Pool } = require('pg');
const { router: stripePaymentRouter } = require('../stripe_payment_webhook');

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
  };
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
    await pool.query('SELECT 1 AS ok');
    return res.status(200).json({
      status: 'ready',
      service: 'richo-revenue-webhook',
      database: 'reachable',
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

app.use('/api', (req, res) => {
  noStore(res);
  return res.status(404).json({ error: 'not_found' });
});

module.exports = app;

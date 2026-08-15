'use strict';

const { Pool } = require('pg');

const DEFAULT_BASE_URL = 'https://richo-paycore-intake-api.vercel.app';
const DEFAULT_TIMEOUT_MS = 5000;

function normalizeBaseUrl(value) {
  const parsed = new URL(value || DEFAULT_BASE_URL);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('PAYCORE_BASE_URL must use http or https');
  }
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function configurationPresence(env) {
  const gstValue = String(env.AU_GST_REGISTERED || '').trim();
  return {
    database: Boolean(env.DATABASE_URL),
    stripeApi: Boolean(env.STRIPE_API_KEY),
    stripeWebhook: Boolean(env.STRIPE_WEBHOOK_SECRET),
    checkoutBaseUrl: Boolean(env.CHECKOUT_BASE_URL),
    gstRegistrationDeclared: gstValue === 'true' || gstValue === 'false',
    posthog: Boolean(env.POSTHOG_PROJECT_TOKEN),
    revenueSync: Boolean(env.REVENUE_SYNC_TOKEN),
  };
}

async function fetchStatus(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': 'richo-activation-evidence/1.0' },
    });

    let body = null;
    const contentType = String(response.headers.get('content-type') || '');
    if (contentType.includes('application/json')) {
      try {
        body = await response.json();
      } catch (_) {
        body = null;
      }
    }

    return {
      status: response.status,
      allow: response.headers.get('allow') || null,
      body,
    };
  } catch (error) {
    return {
      status: null,
      allow: null,
      error: error && error.name === 'AbortError' ? 'timeout' : 'request_failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function collectHttpEvidence({ baseUrl, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const [health, ready, offers, checkout, webhook] = await Promise.all([
    fetchStatus(fetchImpl, `${baseUrl}/api/health`, timeoutMs),
    fetchStatus(fetchImpl, `${baseUrl}/api/ready`, timeoutMs),
    fetchStatus(fetchImpl, `${baseUrl}/api/offers`, timeoutMs),
    fetchStatus(fetchImpl, `${baseUrl}/api/checkout/quick-wins-kit`, timeoutMs),
    fetchStatus(fetchImpl, `${baseUrl}/api/stripe/webhook`, timeoutMs),
  ]);

  return {
    health,
    ready,
    offers: {
      status: offers.status,
      catalogReachable: offers.status === 200,
      offerCount: offers.body && Array.isArray(offers.body.offers) ? offers.body.offers.length : null,
      error: offers.error || null,
    },
    checkout: {
      status: checkout.status,
      postOnlyContractObserved: checkout.status === 405 && checkout.allow === 'POST',
      error: checkout.error || null,
    },
    webhook: {
      status: webhook.status,
      postOnlyContractObserved: webhook.status === 405 && webhook.allow === 'POST',
      error: webhook.error || null,
    },
  };
}

async function collectDatabaseEvidence({ databaseUrl }) {
  if (!databaseUrl) {
    return {
      configured: false,
      checked: false,
      reachable: false,
      schemaReady: false,
      counts: null,
    };
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 1000,
  });

  try {
    const schemaResult = await pool.query(`
      SELECT
        to_regclass('public.payment_intents') IS NOT NULL AS payment_intents,
        to_regclass('public.payment_attempts') IS NOT NULL AS payment_attempts,
        to_regclass('public.webhook_receipts') IS NOT NULL AS webhook_receipts,
        to_regclass('public.paycore_kv') IS NOT NULL AS paycore_kv,
        to_regclass('public.idempotency_records') IS NOT NULL AS idempotency_records
    `);

    const schema = schemaResult.rows[0] || {};
    const schemaReady = Boolean(
      schema.payment_intents &&
      schema.payment_attempts &&
      schema.webhook_receipts &&
      schema.paycore_kv &&
      schema.idempotency_records
    );
    let counts = null;

    if (schemaReady) {
      const countResult = await pool.query(`
        SELECT
          (SELECT count(*)::text FROM public.payment_intents) AS payment_intents,
          (SELECT count(*)::text FROM public.payment_attempts) AS payment_attempts,
          (SELECT count(*)::text FROM public.webhook_receipts) AS webhook_receipts,
          (SELECT count(*)::text FROM public.idempotency_records WHERE scope='stripe_checkout') AS checkout_idempotency_records,
          (SELECT count(*)::text FROM public.paycore_kv WHERE key LIKE 'analytics:posthog:purchase:%') AS purchase_analytics_checkpoints
      `);
      counts = countResult.rows[0] || null;
    }

    return {
      configured: true,
      checked: true,
      reachable: true,
      schemaReady,
      schema: {
        paymentIntents: Boolean(schema.payment_intents),
        paymentAttempts: Boolean(schema.payment_attempts),
        webhookReceipts: Boolean(schema.webhook_receipts),
        paycoreKv: Boolean(schema.paycore_kv),
        idempotencyRecords: Boolean(schema.idempotency_records),
      },
      counts,
    };
  } catch (error) {
    return {
      configured: true,
      checked: true,
      reachable: false,
      schemaReady: false,
      errorCode: String((error && error.code) || 'database_error'),
      counts: null,
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

function evaluateEvidence({ configured, http, database }) {
  const missingConfiguration = Object.entries(configured)
    .filter(([, present]) => !present)
    .map(([name]) => name);

  const checks = {
    health200: http.health.status === 200,
    ready200: http.ready.status === 200,
    offerCatalog200: http.offers.catalogReachable === true && http.offers.offerCount === 3,
    checkoutPostOnly: http.checkout.postOnlyContractObserved === true,
    webhookPostOnly: http.webhook.postOnlyContractObserved === true,
    databaseReachable: database.reachable === true,
    paycoreSchemaReady: database.schemaReady === true,
    configurationComplete: missingConfiguration.length === 0,
  };

  return {
    checks,
    missingConfiguration,
    readyForSignedTest: Object.values(checks).every(Boolean),
  };
}

async function collectActivationEvidence({
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  databaseInspector = collectDatabaseEvidence,
} = {}) {
  const baseUrl = normalizeBaseUrl(env.PAYCORE_BASE_URL || DEFAULT_BASE_URL);
  const configured = configurationPresence(env);
  const http = await collectHttpEvidence({ baseUrl, fetchImpl, timeoutMs });
  const database = await databaseInspector({ databaseUrl: env.DATABASE_URL || '' });
  const gate = evaluateEvidence({ configured, http, database });

  return {
    generatedAt: new Date().toISOString(),
    baseUrl,
    configured,
    http,
    database,
    gate,
  };
}

async function main() {
  const requireReady = process.argv.includes('--require-ready');
  const evidence = await collectActivationEvidence();
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (requireReady && !evidence.gate.readyForSignedTest) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`activation evidence failed: ${error && error.message ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_BASE_URL,
  normalizeBaseUrl,
  configurationPresence,
  collectHttpEvidence,
  collectDatabaseEvidence,
  evaluateEvidence,
  collectActivationEvidence,
};

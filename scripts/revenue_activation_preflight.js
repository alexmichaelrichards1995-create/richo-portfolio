'use strict';

const { Pool } = require('pg');
const { checkoutBaseUrl, stripeModeFromKey } = require('../paycore_checkout');

const REQUIRED_ENV = Object.freeze([
  'DATABASE_URL',
  'STRIPE_API_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'CHECKOUT_BASE_URL',
  'AU_GST_REGISTERED',
  'POSTHOG_PROJECT_TOKEN',
  'REVENUE_SYNC_TOKEN',
]);

const REQUIRED_TABLES = Object.freeze([
  'payment_intents',
  'payment_attempts',
  'webhook_receipts',
  'paycore_kv',
  'idempotency_records',
]);

function configuredValue(key, env) {
  const value = String(env[key] || '').trim();
  if (key === 'AU_GST_REGISTERED') return value === 'true' || value === 'false';
  return Boolean(value);
}

function inspectConfiguration(env = process.env) {
  const configured = Object.fromEntries(
    REQUIRED_ENV.map(key => [key, configuredValue(key, env)]),
  );
  const missing = REQUIRED_ENV.filter(key => !configured[key]);
  const invalid = [];

  if (configured.STRIPE_API_KEY) {
    const stripeMode = stripeModeFromKey(env.STRIPE_API_KEY);
    if (stripeMode === 'unknown') invalid.push('STRIPE_API_KEY_MODE');
    if (stripeMode === 'live' && env.ALLOW_LIVE_STRIPE !== 'true') {
      invalid.push('LIVE_STRIPE_NOT_AUTHORIZED');
    }
  }

  if (configured.CHECKOUT_BASE_URL) {
    try {
      checkoutBaseUrl(env);
    } catch (_) {
      invalid.push('CHECKOUT_BASE_URL');
    }
  }

  return {
    configured,
    missing,
    invalid,
    environmentReady: missing.length === 0 && invalid.length === 0,
  };
}

function validateSchemaProbe(row = {}) {
  const present = Object.fromEntries(
    REQUIRED_TABLES.map(name => [name, Boolean(row[name])]),
  );
  return {
    present,
    missingTables: REQUIRED_TABLES.filter(name => !present[name]),
    schemaReady: REQUIRED_TABLES.every(name => present[name]),
  };
}

async function probeDatabase(connectionString) {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
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
    return validateSchemaProbe(result.rows[0] || {});
  } finally {
    await pool.end().catch(() => {});
  }
}

async function runPreflight({ env = process.env, databaseProbe = probeDatabase } = {}) {
  const config = inspectConfiguration(env);
  if (!config.environmentReady) {
    return {
      ready: false,
      stage: 'configuration',
      ...config,
      database: { checked: false },
    };
  }

  try {
    const schema = await databaseProbe(env.DATABASE_URL);
    return {
      ready: schema.schemaReady,
      stage: schema.schemaReady ? 'ready' : 'database_schema',
      ...config,
      database: {
        checked: true,
        reachable: true,
        ...schema,
      },
    };
  } catch (error) {
    return {
      ready: false,
      stage: 'database_connectivity',
      ...config,
      database: {
        checked: true,
        reachable: false,
        error: error && error.code ? String(error.code) : 'database_unreachable',
      },
    };
  }
}

async function main() {
  const result = await runPreflight();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ready ? 0 : 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error('revenue activation preflight failed', {
      message: error && error.message,
    });
    process.exitCode = 1;
  });
}

module.exports = {
  REQUIRED_ENV,
  REQUIRED_TABLES,
  configuredValue,
  inspectConfiguration,
  validateSchemaProbe,
  probeDatabase,
  runPreflight,
};

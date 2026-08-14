'use strict';

const assert = require('assert');
const {
  inspectConfiguration,
  validateSchemaProbe,
  runPreflight,
} = require('../scripts/revenue_activation_preflight');

(async () => {
  try {
    const missing = inspectConfiguration({
      DATABASE_URL: 'postgres://example',
      STRIPE_WEBHOOK_SECRET: '',
      POSTHOG_PROJECT_TOKEN: 'phc_test',
      REVENUE_SYNC_TOKEN: 'sync_test',
    });
    assert.strictEqual(missing.environmentReady, false);
    assert.deepStrictEqual(missing.missing, ['STRIPE_WEBHOOK_SECRET']);

    const schemaMissing = validateSchemaProbe({
      payment_intents: 'payment_intents',
      payment_attempts: 'payment_attempts',
      webhook_receipts: null,
      paycore_kv: 'paycore_kv',
    });
    assert.strictEqual(schemaMissing.schemaReady, false);
    assert.deepStrictEqual(schemaMissing.missingTables, ['webhook_receipts']);

    const readyEnv = {
      DATABASE_URL: 'postgres://example',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      POSTHOG_PROJECT_TOKEN: 'phc_test',
      REVENUE_SYNC_TOKEN: 'sync_test',
    };

    const ready = await runPreflight({
      env: readyEnv,
      databaseProbe: async connectionString => {
        assert.strictEqual(connectionString, readyEnv.DATABASE_URL);
        return validateSchemaProbe({
          payment_intents: 'payment_intents',
          payment_attempts: 'payment_attempts',
          webhook_receipts: 'webhook_receipts',
          paycore_kv: 'paycore_kv',
        });
      },
    });
    assert.strictEqual(ready.ready, true);
    assert.strictEqual(ready.stage, 'ready');
    assert.strictEqual(ready.database.reachable, true);
    assert.ok(!JSON.stringify(ready).includes('whsec_test'));
    assert.ok(!JSON.stringify(ready).includes('sync_test'));

    const dbFailure = await runPreflight({
      env: readyEnv,
      databaseProbe: async () => {
        const error = new Error('connect failed');
        error.code = 'ECONNREFUSED';
        throw error;
      },
    });
    assert.strictEqual(dbFailure.ready, false);
    assert.strictEqual(dbFailure.stage, 'database_connectivity');
    assert.strictEqual(dbFailure.database.error, 'ECONNREFUSED');

    console.log('revenue activation preflight tests passed');
    process.exit(0);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  }
})();

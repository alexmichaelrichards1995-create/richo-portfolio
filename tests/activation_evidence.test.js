'use strict';

const assert = require('assert');
const http = require('http');
const {
  collectActivationEvidence,
  evaluateEvidence,
} = require('../scripts/activation_evidence');

async function run() {
  const server = await new Promise((resolve, reject) => {
    const instance = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/health') {
        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'alive' }));
        return;
      }
      if (req.url === '/api/ready') {
        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'ready' }));
        return;
      }
      if (req.url === '/api/offers') {
        res.statusCode = 200;
        res.end(JSON.stringify({ offers: [{}, {}, {}] }));
        return;
      }
      if (req.url === '/api/checkout/quick-wins-kit') {
        res.statusCode = 405;
        res.setHeader('allow', 'POST');
        res.end(JSON.stringify({ error: 'method_not_allowed' }));
        return;
      }
      if (req.url === '/api/stripe/webhook') {
        res.statusCode = 405;
        res.setHeader('allow', 'POST');
        res.end(JSON.stringify({ error: 'method_not_allowed' }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not_found' }));
    });

    instance.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });

  try {
    const port = server.address().port;
    const secrets = {
      DATABASE_URL: 'postgres://user:super-secret-db@db.example.test/paycore',
      STRIPE_API_KEY: 'sk_test_super_secret',
      STRIPE_WEBHOOK_SECRET: 'whsec_super_secret',
      CHECKOUT_BASE_URL: 'https://richosystems.technology',
      AU_GST_REGISTERED: 'false',
      POSTHOG_PROJECT_TOKEN: 'phc_super_secret',
      REVENUE_SYNC_TOKEN: 'sync_super_secret',
      PAYCORE_BASE_URL: `http://127.0.0.1:${port}`,
    };

    const evidence = await collectActivationEvidence({
      env: secrets,
      databaseInspector: async () => ({
        configured: true,
        checked: true,
        reachable: true,
        schemaReady: true,
        schema: {
          paymentIntents: true,
          paymentAttempts: true,
          webhookReceipts: true,
          paycoreKv: true,
          idempotencyRecords: true,
        },
        counts: {
          payment_intents: '0',
          payment_attempts: '0',
          webhook_receipts: '0',
          checkout_idempotency_records: '0',
          purchase_analytics_checkpoints: '0',
        },
      }),
    });

    assert.strictEqual(evidence.gate.readyForSignedTest, true);
    assert.strictEqual(evidence.http.health.status, 200);
    assert.strictEqual(evidence.http.ready.status, 200);
    assert.strictEqual(evidence.http.offers.catalogReachable, true);
    assert.strictEqual(evidence.http.offers.offerCount, 3);
    assert.strictEqual(evidence.http.checkout.status, 405);
    assert.strictEqual(evidence.http.checkout.postOnlyContractObserved, true);
    assert.strictEqual(evidence.http.webhook.status, 405);
    assert.strictEqual(evidence.http.webhook.postOnlyContractObserved, true);
    assert.strictEqual(evidence.database.schemaReady, true);

    const serialized = JSON.stringify(evidence);
    assert.ok(!serialized.includes('super-secret-db'));
    assert.ok(!serialized.includes('sk_test_super_secret'));
    assert.ok(!serialized.includes('whsec_super_secret'));
    assert.ok(!serialized.includes('phc_super_secret'));
    assert.ok(!serialized.includes('sync_super_secret'));

    const failedGate = evaluateEvidence({
      configured: {
        database: true,
        stripeApi: true,
        stripeWebhook: true,
        checkoutBaseUrl: true,
        gstRegistrationDeclared: true,
        posthog: true,
        revenueSync: false,
      },
      http: evidence.http,
      database: evidence.database,
    });
    assert.strictEqual(failedGate.readyForSignedTest, false);
    assert.deepStrictEqual(failedGate.missingConfiguration, ['revenueSync']);

    console.log('activation evidence tests passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

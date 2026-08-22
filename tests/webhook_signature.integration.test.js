// Integration coverage for GitHub Marketplace webhook signature handling.
// Proves fail-closed behavior for missing secrets, rejection of invalid
// signatures, and acceptance of a valid signature.

const http = require('http');
const express = require('express');
const crypto = require('crypto');
const { router, clearHandledForTests } = require('../marketplace_webhook_handler');

const TEST_SECRET = 'richo-test-webhook-secret-not-for-production';

function sign(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(Buffer.from(payload));
  return `sha256=${hmac.digest('hex')}`;
}

function postWebhook(port, payload, signature, deliveryId) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/webhooks/marketplace',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-hub-signature-256': signature,
          'x-github-delivery': deliveryId,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk.toString()));
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      },
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  const app = express();
  app.use('/webhooks', router);
  await clearHandledForTests();

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const payload = JSON.stringify({
      action: 'purchased',
      marketplace_purchase: {
        account: { login: 'acme', id: 111 },
        plan: { id: 1, name: 'Pro', monthly_price_in_cents: 2900 },
      },
    });

    delete process.env.GITHUB_WEBHOOK_SECRET;
    const missingSecret = await postWebhook(
      port,
      payload,
      sign(payload, 'attacker-known-secret'),
      'integration-missing-secret',
    );
    if (missingSecret.statusCode !== 503) {
      throw new Error(`missing secret should fail closed with 503, got ${missingSecret.statusCode}`);
    }

    process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;
    const invalid = await postWebhook(
      port,
      payload,
      sign(payload, 'wrong-secret'),
      'integration-invalid-signature',
    );
    if (invalid.statusCode !== 401) {
      throw new Error(`invalid signature should return 401, got ${invalid.statusCode}`);
    }

    const valid = await postWebhook(
      port,
      payload,
      sign(payload, TEST_SECRET),
      'integration-valid-signature',
    );
    if (valid.statusCode !== 200 || valid.body !== 'ok') {
      throw new Error(`valid signature was not accepted: ${valid.statusCode} ${valid.body}`);
    }

    console.log('OK: webhook fails closed and accepts only a valid configured signature');
    process.exitCode = 0;
  } catch (err) {
    console.error('FAILED:', err && err.message);
    process.exitCode = 1;
  } finally {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    server.close();
  }
})();

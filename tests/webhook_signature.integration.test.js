// Integration test: start an express app mounting the webhook router and POST a signed payload
// Run with: node tests/webhook_signature.integration.test.js

const http = require('http');
const express = require('express');
const crypto = require('crypto');

(async () => {
  try {
    process.env.GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'integration-webhook-secret';
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for webhook signature integration test');
    }

    const { router, clearHandledForTests } = require('../marketplace_webhook_handler');
    await clearHandledForTests();

    const app = express();
    app.use('/webhooks', router);

    const server = app.listen(0, async () => {
      const port = server.address().port;
      const payload = JSON.stringify({
        action: 'purchased',
        marketplace_purchase: {
          account: { login: 'acme', id: 111 },
          plan: { id: 1, name: 'Pro', monthly_price_in_cents: 2900 },
          effective_date: new Date().toISOString(),
        },
      });
      const secret = process.env.GITHUB_WEBHOOK_SECRET;
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(Buffer.from(payload));
      const sig = `sha256=${hmac.digest('hex')}`;

      const options = {
        hostname: '127.0.0.1',
        port,
        path: '/webhooks/marketplace',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-hub-signature-256': sig,
          'x-github-delivery': 'integration-test-1',
        },
      };

      const req = http.request(options, (res) => {
        let b = '';
        res.on('data', (c) => { b += c.toString(); });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(b);
            if (res.statusCode === 202 && parsed.accepted === true && parsed.duplicate === false) {
              console.log('OK: webhook accepted with valid signature');
              server.close();
              process.exit(0);
            } else {
              console.error('FAILED: webhook response', res.statusCode, b);
              server.close();
              process.exit(1);
            }
          } catch (error) {
            console.error('FAILED: response parse error', error.message, b);
            server.close();
            process.exit(1);
          }
        });
      });

      req.on('error', (err) => {
        console.error('FAILED: request error', err && err.message);
        server.close();
        process.exit(1);
      });

      req.write(payload);
      req.end();
    });
  } catch (error) {
    console.error('FAILED', error && error.message);
    process.exit(1);
  }
})();

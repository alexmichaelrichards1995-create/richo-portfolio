// Integration test: start an express app mounting the webhook router and POST a signed payload
// Run with: node tests/webhook_signature.integration.test.js

const http = require('http');
const express = require('express');
const crypto = require('crypto');
const { router } = require('../marketplace_webhook_handler');

(async () => {
  const app = express();
  app.use('/webhooks', router);

  const server = app.listen(0, async () => {
    const port = server.address().port;
    const payload = JSON.stringify({ action: 'purchased', marketplace_purchase: { account: { login: 'acme', id: 111 }, plan: { id: 1, name: 'Pro', monthly_price_in_cents: 2900 } } });
    const secret = process.env.GITHUB_WEBHOOK_SECRET || 'replace-me';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(Buffer.from(payload));
    const sig = `sha256=${hmac.digest('hex')}`;

    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: '/webhooks/marketplace',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-hub-signature-256': sig,
        'x-github-delivery': 'integration-test-1'
      }
    };

    const req = http.request(options, res => {
      let b = '';
      res.on('data', c => b += c.toString());
      res.on('end', () => {
        if (res.statusCode === 200 && b === 'ok') {
          console.log('OK: webhook accepted with valid signature');
          server.close();
          process.exit(0);
        } else {
          console.error('FAILED: webhook response', res.statusCode, b);
          server.close();
          process.exit(1);
        }
      });
    });

    req.on('error', err => {
      console.error('FAILED: request error', err && err.message);
      server.close();
      process.exit(1);
    });

    req.write(payload);
    req.end();
  });
})();

// End-to-end test: post a signed marketplace_purchase webhook and verify Postgres records
// Run: node tests/webhook_end_to_end.test.js

const http = require('http');
const express = require('express');
const crypto = require('crypto');
const { router } = require('../marketplace_webhook_handler');
const { Client } = require('pg');

(async () => {
  const app = express();
  app.use('/webhooks', router);

  const server = app.listen(0, async () => {
    const port = server.address().port;

    const accountId = 424242;
    const deliveryId = `e2e-${Date.now()}`;
    const payload = JSON.stringify({
      action: 'purchased',
      marketplace_purchase: {
        account: { login: 'e2e-test-org', id: accountId, type: 'Organization' },
        plan: { id: 99, name: 'E2E-Plan', monthly_price_in_cents: 9900 }
      }
    });

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
        'x-github-delivery': deliveryId
      }
    };

    const req = http.request(options, async res => {
      let b = '';
      res.on('data', c => b += c.toString());
      res.on('end', async () => {
        try {
          if (res.statusCode !== 200) throw new Error(`webhook not accepted: ${res.statusCode} ${b}`);

          const connection = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
          const client = new Client({ connectionString: connection });
          await client.connect();

          // check deliveries
          const dl = await client.query('SELECT delivery_id, processed FROM deliveries WHERE delivery_id = $1', [deliveryId]);
          if (!dl.rows.length) throw new Error('delivery row not found');
          if (!dl.rows[0].processed) throw new Error('delivery not marked processed');

          // check subscription
          const sub = await client.query('SELECT account_id, plan_id FROM subscriptions WHERE account_id = $1', [accountId]);
          if (!sub.rows.length) throw new Error('subscription row not found');

          console.log('OK: webhook end-to-end verified');
          await client.end();
          server.close();
          process.exit(0);
        } catch (err) {
          console.error('FAILED:', err && err.message);
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

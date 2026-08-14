'use strict';

const assert = require('assert');
const http = require('http');

process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_vercel_entrypoint';
delete process.env.REVENUE_SYNC_TOKEN;

const app = require('../api/index');

function request(port, options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      ...options,
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });

  try {
    const address = server.address();
    const port = address.port;

    const health = await request(port, { method: 'GET', path: '/api/health' });
    assert.strictEqual(health.statusCode, 200);
    const healthJson = JSON.parse(health.body);
    assert.strictEqual(healthJson.status, 'alive');
    assert.strictEqual(healthJson.service, 'richo-revenue-webhook');
    assert.strictEqual(healthJson.configured.revenueSync, false);
    assert.strictEqual(health.headers['cache-control'], 'no-store, max-age=0');

    const disabledSync = await request(port, { method: 'POST', path: '/api/revenue-sync' });
    assert.strictEqual(disabledSync.statusCode, 503);
    assert.deepStrictEqual(JSON.parse(disabledSync.body), { error: 'revenue_sync_disabled' });

    process.env.REVENUE_SYNC_TOKEN = 'test_revenue_sync_token';
    const unauthorizedSync = await request(port, {
      method: 'POST',
      path: '/api/revenue-sync',
      headers: { authorization: 'Bearer wrong_token' },
    });
    assert.strictEqual(unauthorizedSync.statusCode, 401);
    assert.deepStrictEqual(JSON.parse(unauthorizedSync.body), { error: 'unauthorized' });
    delete process.env.REVENUE_SYNC_TOKEN;

    const invalidWebhook = await request(
      port,
      {
        method: 'POST',
        path: '/api/stripe',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength('{"id":"evt_test"}'),
        },
      },
      '{"id":"evt_test"}',
    );
    assert.strictEqual(invalidWebhook.statusCode, 400);
    assert.match(invalidWebhook.body, /invalid webhook/i);

    const unknown = await request(port, { method: 'GET', path: '/api/does-not-exist' });
    assert.strictEqual(unknown.statusCode, 404);
    assert.deepStrictEqual(JSON.parse(unknown.body), { error: 'not_found' });

    console.log('vercel api entrypoint tests passed');
  } finally {
    delete process.env.REVENUE_SYNC_TOKEN;
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

const http = require('http');
const crypto = require('crypto');
const express = require('express');

process.env.GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'test-github-webhook-secret';
const { router } = require('../marketplace_webhook_handler');

function request(port, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/webhooks/marketplace', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function sign(body) {
  return `sha256=${crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET).update(Buffer.from(body)).digest('hex')}`;
}

(async () => {
  const app = express();
  app.use('/webhooks', router);
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const validEvent = { action: 'purchased', marketplace_purchase: { account: { id: 111 }, plan: { id: 1, name: 'Pro', monthly_price_in_cents: 2900 } } };
    const validBody = JSON.stringify(validEvent);

    let r = await request(port, validBody, { 'x-github-delivery': 'sec-1' });
    if (r.status !== 400) throw new Error(`missing signature expected 400, got ${r.status}`);

    r = await request(port, validBody, { 'x-github-delivery': 'sec-2', 'x-hub-signature-256': 'sha256=deadbeef' });
    if (r.status !== 401) throw new Error(`malformed signature expected 401, got ${r.status}`);

    r = await request(port, validBody, { 'x-github-delivery': 'sec-3', 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` });
    if (r.status !== 401) throw new Error(`invalid signature expected 401, got ${r.status}`);

    r = await request(port, validBody, { 'x-hub-signature-256': sign(validBody) });
    if (r.status !== 400) throw new Error(`missing delivery expected 400, got ${r.status}`);

    const badAccount = JSON.stringify({ action: 'purchased', marketplace_purchase: { account: { id: 0 }, plan: { id: 1 } } });
    r = await request(port, badAccount, { 'x-github-delivery': 'sec-4', 'x-hub-signature-256': sign(badAccount) });
    if (r.status !== 400) throw new Error(`bad account expected 400, got ${r.status}`);

    const ignored = JSON.stringify({ action: 'pending_change', marketplace_purchase: {} });
    r = await request(port, ignored, { 'x-github-delivery': 'sec-5', 'x-hub-signature-256': sign(ignored) });
    if (r.status !== 202) throw new Error(`unsupported action expected 202, got ${r.status}`);

    console.log('OK: adversarial webhook security cases rejected safely');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err.message);
    server.close();
    process.exit(1);
  }
})();

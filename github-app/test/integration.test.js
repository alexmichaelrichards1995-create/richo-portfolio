const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const integration = DATABASE_URL ? test : test.skip;

function signature(body, secret) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

async function waitFor(url, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function sendWebhook(baseUrl, secret, delivery, event, payload) {
  const raw = Buffer.from(JSON.stringify(payload));
  return fetch(`${baseUrl}/webhooks/github`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-delivery': delivery,
      'x-github-event': event,
      'x-hub-signature-256': signature(raw, secret),
    },
    body: raw,
  });
}

integration('Marketplace lifecycle and delivery idempotency persist correctly', async (t) => {
  const port = 3217;
  const baseUrl = `http://127.0.0.1:${port}`;
  const secret = 'integration-webhook-secret';
  const db = new Pool({ connectionString: DATABASE_URL });
  await db.query('TRUNCATE webhook_deliveries, jobs, audit_log, marketplace_subscriptions, installations, github_users RESTART IDENTITY CASCADE');

  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      PUBLIC_BASE_URL: baseUrl,
      GITHUB_WEBHOOK_SECRET: secret,
      SESSION_SECRET: 'integration-session-secret-32-characters-minimum',
      ADMIN_TOKEN: 'integration-admin-token',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  t.after(async () => {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    await db.end();
    if (stderr) process.stderr.write(stderr);
  });

  await waitFor(`${baseUrl}/health/live`);

  const basePurchase = {
    sender: { login: 'octocat' },
    marketplace_purchase: {
      account: { login: 'octocat', id: 12345, type: 'User' },
      plan: { id: 456, name: 'Professional', monthly_price_in_cents: 2900 },
      effective_date: new Date().toISOString(),
    },
  };

  let response = await sendWebhook(baseUrl, secret, 'delivery-purchase', 'marketplace_purchase', { ...basePurchase, action: 'purchased' });
  assert.equal(response.status, 202);
  let body = await response.json();
  assert.equal(body.duplicate, false);

  response = await sendWebhook(baseUrl, secret, 'delivery-purchase', 'marketplace_purchase', { ...basePurchase, action: 'purchased' });
  assert.equal(response.status, 202);
  body = await response.json();
  assert.equal(body.duplicate, true);

  let subscription = (await db.query('SELECT tier,status,plan_name FROM marketplace_subscriptions WHERE account_id=$1', [12345])).rows[0];
  assert.deepEqual(subscription, { tier: 'professional', status: 'active', plan_name: 'Professional' });

  const changed = JSON.parse(JSON.stringify(basePurchase));
  changed.action = 'changed';
  changed.marketplace_purchase.plan = { id: 789, name: 'Enterprise', monthly_price_in_cents: 50000 };
  response = await sendWebhook(baseUrl, secret, 'delivery-change', 'marketplace_purchase', changed);
  assert.equal(response.status, 202);
  subscription = (await db.query('SELECT tier,status,plan_name FROM marketplace_subscriptions WHERE account_id=$1', [12345])).rows[0];
  assert.deepEqual(subscription, { tier: 'enterprise', status: 'active', plan_name: 'Enterprise' });

  const cancelled = JSON.parse(JSON.stringify(changed));
  cancelled.action = 'cancelled';
  cancelled.marketplace_purchase.effective_date = new Date(Date.now() - 1000).toISOString();
  response = await sendWebhook(baseUrl, secret, 'delivery-cancel', 'marketplace_purchase', cancelled);
  assert.equal(response.status, 202);
  subscription = (await db.query('SELECT tier,status,plan_name FROM marketplace_subscriptions WHERE account_id=$1', [12345])).rows[0];
  assert.deepEqual(subscription, { tier: 'free', status: 'free', plan_name: 'Free' });

  const badRaw = Buffer.from('{}');
  response = await fetch(`${baseUrl}/webhooks/github`, {
    method: 'POST',
    headers: {
      'x-github-delivery': 'delivery-bad',
      'x-github-event': 'push',
      'x-hub-signature-256': 'sha256=bad',
    },
    body: badRaw,
  });
  assert.equal(response.status, 401);

  const deliveries = Number((await db.query('SELECT count(*)::int AS count FROM webhook_deliveries')).rows[0].count);
  assert.equal(deliveries, 3);
});
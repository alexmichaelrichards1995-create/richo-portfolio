const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const PORT = 3239;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ADMIN_TOKEN = 'integration-readiness-admin-token';

async function waitForServer(child) {
  let lastError = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`readiness child exited early with ${child.exitCode}`);
    try {
      const response = await fetch(`${BASE_URL}/health/live`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error('readiness child did not start');
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

test('canonical readiness keeps public output minimal and detailed checks admin-only', async (t) => {
  const child = spawn(process.execPath, ['src/hardened-entrypoint.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      PUBLIC_BASE_URL: BASE_URL,
      DATABASE_URL: '',
      DATABASE_SSL: 'false',
      GITHUB_APP_ID: 'integration-app-id',
      GITHUB_CLIENT_ID: 'integration-client-id',
      GITHUB_CLIENT_SECRET: 'integration-client-secret',
      GITHUB_WEBHOOK_SECRET: 'integration-webhook-secret',
      GITHUB_PRIVATE_KEY_B64: Buffer.from('integration-private-key-placeholder').toString('base64'),
      SESSION_SECRET: 'integration-session-secret-32-characters-minimum',
      ADMIN_TOKEN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stderr = [];
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  t.after(() => stopChild(child));

  await waitForServer(child);

  const publicResponse = await fetch(`${BASE_URL}/health/ready`);
  assert.equal(publicResponse.status, 503);
  const publicBody = await publicResponse.json();
  assert.deepEqual(publicBody, { ok: false });
  assert.deepEqual(Object.keys(publicBody), ['ok']);

  const unauthenticated = await fetch(`${BASE_URL}/admin/health/ready`);
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), { error: 'Unauthorized' });

  const authenticated = await fetch(`${BASE_URL}/admin/health/ready`, {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  });
  assert.equal(authenticated.status, 503);
  const adminBody = await authenticated.json();
  assert.equal(adminBody.ok, false);
  assert.equal(adminBody.checks.database, false);
  assert.equal(adminBody.checks.webhook_secret, true);
  assert.equal(adminBody.checks.app_id, true);
  assert.equal(adminBody.checks.private_key, true);
  assert.equal(adminBody.checks.oauth_client, true);
  assert.equal(adminBody.checks.session_secret, true);
  assert.equal(adminBody.checks.admin_token, true);
  assert.match(adminBody.checked_at, /^\d{4}-\d{2}-\d{2}T/);

  const serializedAdmin = JSON.stringify(adminBody);
  assert.doesNotMatch(serializedAdmin, /integration-readiness-admin-token/);
  assert.doesNotMatch(serializedAdmin, /integration-client-secret/);
  assert.doesNotMatch(serializedAdmin, /integration-webhook-secret/);

  assert.equal(stderr.length, 0, Buffer.concat(stderr).toString('utf8'));
});

const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const GITHUB_API = 'https://api.github.com';

function databaseSslOptions() {
  if (process.env.DATABASE_SSL !== 'true') return undefined;
  const ca = process.env.DATABASE_CA_CERT || '';
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: databaseSslOptions(),
      max: Number(process.env.DATABASE_POOL_MAX || 10),
    })
  : null;

function log(level, message, detail = {}) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level, message, ...detail })}\n`);
}

function env(name, required = true) {
  const value = process.env[name];
  if (required && !value) throw new Error(`Missing required environment variable: ${name}`);
  return value || '';
}

function timingSafeEqualText(a, b) {
  const aa = Buffer.from(a || '');
  const bb = Buffer.from(b || '');
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return timingSafeEqualText(expected, signatureHeader);
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function normalizePrivateKey() {
  const b64 = process.env.GITHUB_PRIVATE_KEY_B64;
  if (b64) return Buffer.from(b64, 'base64').toString('utf8');
  return env('GITHUB_PRIVATE_KEY').replace(/\\n/g, '\n');
}

function createAppJwt(nowSeconds = Math.floor(Date.now() / 1000)) {
  const appId = env('GITHUB_APP_ID');
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: appId }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), normalizePrivateKey()).toString('base64url');
  return `${unsigned}.${signature}`;
}

async function githubRequest(path, options = {}) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'richo-github-app',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const error = new Error(`GitHub API ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function getInstallationToken(installationId) {
  return githubRequest(`/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${createAppJwt()}` },
  }).then((body) => body.token);
}

function planTier(planName = '') {
  const name = String(planName).trim().toLowerCase();
  if (name.includes('enterprise')) return 'enterprise';
  if (name.includes('business')) return 'business';
  if (name.includes('professional') || name === 'pro') return 'professional';
  if (name.includes('starter')) return 'starter';
  return 'free';
}

function featuresForTier(tier) {
  const base = ['repository_health', 'basic_pr_checks'];
  if (tier === 'starter') return [...base, 'basic_security'];
  if (tier === 'professional') return [...base, 'basic_security', 'advanced_analytics', 'api_access', 'team_collaboration'];
  if (tier === 'business') return [...base, 'basic_security', 'advanced_analytics', 'api_access', 'team_collaboration', 'policy_engine', 'priority_support'];
  if (tier === 'enterprise') return [...base, 'basic_security', 'advanced_analytics', 'api_access', 'team_collaboration', 'policy_engine', 'priority_support', 'sso', 'audit_exports', 'custom_integrations'];
  return base;
}

function makeSignedToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readSignedToken(token, secret) {
  if (!token || !secret) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (!timingSafeEqualText(sig, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

async function withTransaction(fn) {
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function audit(client, action, detail = {}, targetType = null, targetId = null, actorType = 'system', actorId = null) {
  await client.query(
    `INSERT INTO audit_log(actor_type, actor_id, action, target_type, target_id, detail)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [actorType, actorId, action, targetType, targetId, detail]
  );
}

async function processMarketplace(client, action, payload) {
  const purchase = payload.marketplace_purchase || {};
  const account = purchase.account || {};
  const plan = purchase.plan || {};
  if (!account.id) throw new Error('Marketplace payload is missing account.id');

  const tier = planTier(plan.name);
  const effectiveAt = purchase.effective_date ? new Date(purchase.effective_date) : new Date();
  const isFuture = effectiveAt.getTime() > Date.now() + 1000;

  if (action === 'purchased' || action === 'changed') {
    const status = tier === 'free' ? 'free' : 'active';
    await client.query(
      `INSERT INTO subscriptions(account_id, account_login, plan_id, plan_name, tier, status, effective_at, raw_plan, updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT(account_id) DO UPDATE SET
         account_login=EXCLUDED.account_login, plan_id=EXCLUDED.plan_id, plan_name=EXCLUDED.plan_name,
         tier=EXCLUDED.tier, status=EXCLUDED.status, effective_at=EXCLUDED.effective_at,
         raw_plan=EXCLUDED.raw_plan, updated_at=now()`,
      [account.id, account.login || null, plan.id || null, plan.name || 'Free', tier, status, effectiveAt, plan]
    );
  } else if (action === 'cancelled') {
    if (isFuture) {
      await client.query(
        `INSERT INTO subscriptions(account_id, account_login, plan_id, plan_name, tier, status, effective_at, raw_plan, updated_at)
         VALUES($1,$2,$3,$4,$5,'cancellation_pending',$6,$7,now())
         ON CONFLICT(account_id) DO UPDATE SET status='cancellation_pending', effective_at=$6, updated_at=now()`,
        [account.id, account.login || null, plan.id || null, plan.name || 'Free', tier, effectiveAt, plan]
      );
    } else {
      await client.query(
        `INSERT INTO subscriptions(account_id, account_login, plan_name, tier, status, effective_at, raw_plan, updated_at)
         VALUES($1,$2,'Free','free','free',$3,$4,now())
         ON CONFLICT(account_id) DO UPDATE SET plan_name='Free', tier='free', status='free', effective_at=$3, raw_plan=$4, updated_at=now()`,
        [account.id, account.login || null, effectiveAt, plan]
      );
    }
  } else {
    throw new Error(`Unsupported marketplace action: ${action}`);
  }

  await audit(client, `marketplace.${action}`, { plan_id: plan.id, plan_name: plan.name, effective_at: effectiveAt.toISOString() }, 'github_account', String(account.id), 'github', payload.sender?.login || null);
}

async function processInstallation(client, action, payload) {
  const installation = payload.installation || {};
  const account = installation.account || {};
  if (!installation.id || !account.id) throw new Error('Installation payload is missing identifiers');
  const inactive = ['deleted', 'suspend'].includes(action);
  const status = inactive ? 'inactive' : 'active';
  await client.query(
    `INSERT INTO installations(installation_id, account_id, account_login, account_type, status, last_event_at, updated_at)
     VALUES($1,$2,$3,$4,$5,now(),now())
     ON CONFLICT(installation_id) DO UPDATE SET account_id=EXCLUDED.account_id, account_login=EXCLUDED.account_login,
       account_type=EXCLUDED.account_type, status=EXCLUDED.status, last_event_at=now(), updated_at=now()`,
    [installation.id, account.id, account.login || 'unknown', account.type || 'Unknown', status]
  );
  await audit(client, `installation.${action}`, { installation_id: installation.id }, 'github_account', String(account.id), 'github', payload.sender?.login || null);
}

async function enqueue(client, kind, payload) {
  await client.query('INSERT INTO jobs(kind, payload) VALUES($1,$2)', [kind, payload]);
}

async function processWebhookDelivery(deliveryId, eventName, payload) {
  return withTransaction(async (client) => {
    const action = payload.action || null;
    const inserted = await client.query(
      `INSERT INTO webhook_deliveries(delivery_id,event_name,action,status,payload)
       VALUES($1,$2,$3,'processing',$4)
       ON CONFLICT(delivery_id) DO NOTHING
       RETURNING delivery_id`,
      [deliveryId, eventName, action, payload]
    );
    if (inserted.rowCount === 0) return { duplicate: true };

    if (eventName === 'marketplace_purchase') {
      await processMarketplace(client, action, payload);
    } else if (eventName === 'installation') {
      await processInstallation(client, action, payload);
    } else if (eventName === 'pull_request' && ['opened', 'reopened', 'synchronize'].includes(action)) {
      const repo = payload.repository?.full_name;
      const installationId = payload.installation?.id;
      const sha = payload.pull_request?.head?.sha;
      if (repo && installationId && sha) await enqueue(client, 'pr_check', { repo, installationId, sha, number: payload.pull_request.number, action });
    } else if (eventName === 'push') {
      await enqueue(client, 'push_event', { repo: payload.repository?.full_name, installationId: payload.installation?.id, after: payload.after, ref: payload.ref });
    } else if (eventName === 'issues') {
      await enqueue(client, 'issue_event', { repo: payload.repository?.full_name, installationId: payload.installation?.id, number: payload.issue?.number, action });
    }

    await client.query(`UPDATE webhook_deliveries SET status='processed', processed_at=now() WHERE delivery_id=$1`, [deliveryId]);
    await audit(client, 'webhook.processed', { event_name: eventName, action }, 'webhook_delivery', deliveryId, 'github', payload.sender?.login || null);
    return { duplicate: false };
  });
}

async function createCheckRun(job) {
  if (!job.installationId || !job.repo || !job.sha) return;
  const token = await getInstallationToken(job.installationId);
  await githubRequest(`/repos/${job.repo}/check-runs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'R.I.C.H.O. Guard',
      head_sha: job.sha,
      status: 'completed',
      conclusion: 'neutral',
      output: {
        title: 'R.I.C.H.O. intake verified',
        summary: 'Webhook authentication, installation-token authentication, durable event storage and PR event processing succeeded. Full code-analysis rules can now run behind this verified path.'
      }
    }),
  });
}

async function claimJob() {
  if (!pool) return null;
  const result = await pool.query(
    `WITH next_job AS (
       SELECT id FROM jobs WHERE status='queued' AND available_at <= now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE jobs SET status='running', locked_at=now(), updated_at=now()
     WHERE id=(SELECT id FROM next_job)
     RETURNING *`
  );
  return result.rows[0] || null;
}

async function completeJob(id) {
  await pool.query(`UPDATE jobs SET status='done', updated_at=now() WHERE id=$1`, [id]);
}

async function failJob(job, error) {
  const nextAttempts = Number(job.attempts) + 1;
  const dead = nextAttempts >= Number(job.max_attempts);
  const delaySeconds = Math.min(300, Math.max(2, 2 ** nextAttempts));
  await pool.query(
    `UPDATE jobs SET status=$2, attempts=$3, last_error=$4,
      available_at=now() + ($5::text || ' seconds')::interval, updated_at=now()
     WHERE id=$1`,
    [job.id, dead ? 'dead' : 'queued', nextAttempts, String(error.message || error).slice(0, 2000), delaySeconds]
  );
}

async function runJob(job) {
  if (job.kind === 'pr_check') await createCheckRun(job.payload);
  else if (job.kind === 'push_event' || job.kind === 'issue_event') {
    await withTransaction((client) => audit(client, `job.${job.kind}`, job.payload, 'job', String(job.id)));
  }
}

async function workerTick() {
  try {
    const job = await claimJob();
    if (!job) return;
    try {
      await runJob(job);
      await completeJob(job.id);
      log('info', 'job completed', { job_id: job.id, kind: job.kind });
    } catch (error) {
      await failJob(job, error);
      log('error', 'job failed', { job_id: job.id, kind: job.kind, error: error.message });
    }
  } catch (error) {
    log('error', 'worker tick failed', { error: error.message });
  }
}

async function expirePendingCancellations() {
  if (!pool) return;
  await pool.query(
    `UPDATE subscriptions SET tier='free', plan_name='Free', status='free', updated_at=now()
     WHERE status='cancellation_pending' AND effective_at IS NOT NULL AND effective_at <= now()`
  );
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function html(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function readRawBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function currentSession(req) {
  return readSignedToken(parseCookies(req).richo_session, process.env.SESSION_SECRET || '');
}

function requireAdmin(req) {
  const expected = process.env.ADMIN_TOKEN || '';
  return Boolean(expected && timingSafeEqualText(String(req.headers['x-admin-token'] || ''), expected));
}

async function route(req, res) {
  const url = new URL(req.url, BASE_URL);

  if (req.method === 'GET' && url.pathname === '/') {
    return html(res, 200, `<!doctype html><meta charset="utf-8"><title>R.I.C.H.O. GitHub App</title><style>body{font-family:system-ui;max-width:760px;margin:60px auto;padding:0 20px}code{background:#eee;padding:2px 5px;border-radius:4px}.card{border:1px solid #ddd;border-radius:14px;padding:24px;margin:16px 0}</style><h1>R.I.C.H.O. GitHub App</h1><div class="card"><b>Service core</b><p>GitHub App authentication, Marketplace entitlements, signed webhooks, durable jobs and PR check-run integration.</p><p><a href="/auth/github">Sign in with GitHub</a> · <a href="/health/ready">Readiness</a></p></div>`);
  }

  if (req.method === 'GET' && url.pathname === '/health/live') return json(res, 200, { ok: true, service: 'richo-github-app' });

  if (req.method === 'GET' && url.pathname === '/health/ready') {
    let databaseReady = false;
    if (pool) {
      try { await pool.query('SELECT 1'); databaseReady = true; } catch {}
    }
    const ok = Boolean(
      databaseReady &&
      process.env.GITHUB_WEBHOOK_SECRET &&
      process.env.GITHUB_APP_ID &&
      (process.env.GITHUB_PRIVATE_KEY || process.env.GITHUB_PRIVATE_KEY_B64) &&
      process.env.GITHUB_CLIENT_ID &&
      process.env.GITHUB_CLIENT_SECRET &&
      process.env.SESSION_SECRET
    );
    return json(res, ok ? 200 : 503, { ok });
  }

  if (req.method === 'GET' && url.pathname === '/auth/github') {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.SESSION_SECRET) return json(res, 503, { error: 'OAuth is not configured' });
    const state = makeSignedToken({ kind: 'oauth', nonce: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 600 }, process.env.SESSION_SECRET);
    const redirect = new URL('https://github.com/login/oauth/authorize');
    redirect.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID);
    redirect.searchParams.set('redirect_uri', `${BASE_URL}/auth/github/callback`);
    redirect.searchParams.set('state', state);
    res.writeHead(302, { Location: redirect.toString(), 'Cache-Control': 'no-store' });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/auth/github/callback') {
    const state = readSignedToken(url.searchParams.get('state'), process.env.SESSION_SECRET || '');
    if (!state || state.kind !== 'oauth') return json(res, 400, { error: 'Invalid OAuth state' });
    const code = url.searchParams.get('code');
    if (!code) return json(res, 400, { error: 'Missing OAuth code' });
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'richo-github-app' },
      body: JSON.stringify({ client_id: env('GITHUB_CLIENT_ID'), client_secret: env('GITHUB_CLIENT_SECRET'), code, redirect_uri: `${BASE_URL}/auth/github/callback` }),
    });
    const tokenBody = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenBody.access_token) return json(res, 502, { error: 'GitHub OAuth token exchange failed' });
    const user = await githubRequest('/user', { headers: { Authorization: `Bearer ${tokenBody.access_token}` } });
    if (!pool) return json(res, 503, { error: 'Database is not configured' });
    await pool.query(
      `INSERT INTO github_users(github_id,login,avatar_url,updated_at) VALUES($1,$2,$3,now())
       ON CONFLICT(github_id) DO UPDATE SET login=EXCLUDED.login, avatar_url=EXCLUDED.avatar_url, updated_at=now()`,
      [user.id, user.login, user.avatar_url || null]
    );
    const session = makeSignedToken({ github_id: user.id, login: user.login, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }, env('SESSION_SECRET'));
    const secure = BASE_URL.startsWith('https://') ? '; Secure' : '';
    res.writeHead(302, { Location: '/dashboard', 'Set-Cookie': `richo_session=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}` });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/dashboard') {
    const session = currentSession(req);
    if (!session) { res.writeHead(302, { Location: '/auth/github' }); return res.end(); }
    const sub = pool ? await pool.query('SELECT tier,status,plan_name,effective_at FROM subscriptions WHERE account_id=$1', [session.github_id]) : { rows: [] };
    const current = sub.rows[0] || { tier: 'free', status: 'free', plan_name: 'Free' };
    return html(res, 200, `<!doctype html><meta charset="utf-8"><title>R.I.C.H.O. Dashboard</title><style>body{font-family:system-ui;max-width:900px;margin:50px auto;padding:0 20px}.card{border:1px solid #ddd;border-radius:14px;padding:20px;margin:12px 0}</style><h1>R.I.C.H.O. Dashboard</h1><p>Signed in as <b>${String(session.login).replace(/[<>&"]/g,'')}</b></p><div class="card"><h2>${current.plan_name}</h2><p>Status: ${current.status}</p><p>Tier: ${current.tier}</p></div><div class="card"><h3>Enabled capabilities</h3><ul>${featuresForTier(current.tier).map((x)=>`<li>${x}</li>`).join('')}</ul></div>`);
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const session = currentSession(req);
    if (!session) return json(res, 401, { error: 'Not authenticated' });
    const result = pool ? await pool.query('SELECT github_id,login,avatar_url,created_at,updated_at FROM github_users WHERE github_id=$1', [session.github_id]) : { rows: [] };
    return json(res, 200, { user: result.rows[0] || { github_id: session.github_id, login: session.login } });
  }

  if (req.method === 'POST' && url.pathname === '/webhooks/github') {
    if (!pool) return json(res, 503, { error: 'Database is not configured' });
    const raw = await readRawBody(req);
    const signature = String(req.headers['x-hub-signature-256'] || '');
    const deliveryId = String(req.headers['x-github-delivery'] || '');
    const eventName = String(req.headers['x-github-event'] || '');
    if (!deliveryId || !eventName) return json(res, 400, { error: 'Missing GitHub delivery headers' });
    if (!verifyWebhookSignature(raw, signature, env('GITHUB_WEBHOOK_SECRET'))) return json(res, 401, { error: 'Invalid webhook signature' });
    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    const result = await processWebhookDelivery(deliveryId, eventName, payload);
    return json(res, 202, { accepted: true, duplicate: result.duplicate });
  }

  if (req.method === 'GET' && url.pathname === '/admin/jobs') {
    if (!requireAdmin(req)) return json(res, 401, { error: 'Unauthorized' });
    const result = await pool.query(`SELECT id,kind,status,attempts,max_attempts,available_at,last_error,created_at,updated_at FROM jobs ORDER BY id DESC LIMIT 100`);
    return json(res, 200, { jobs: result.rows });
  }

  const replayMatch = url.pathname.match(/^\/admin\/jobs\/(\d+)\/replay$/);
  if (req.method === 'POST' && replayMatch) {
    if (!requireAdmin(req)) return json(res, 401, { error: 'Unauthorized' });
    await pool.query(`UPDATE jobs SET status='queued', attempts=0, available_at=now(), last_error=NULL, updated_at=now() WHERE id=$1`, [replayMatch[1]]);
    return json(res, 200, { requeued: Number(replayMatch[1]) });
  }

  return json(res, 404, { error: 'Not found' });
}

function start() {
  const server = http.createServer((req, res) => {
    route(req, res).catch((error) => {
      log('error', 'request failed', { method: req.method, path: req.url, error: error.message });
      if (!res.headersSent) json(res, error.status || 500, { error: error.status && error.status < 500 ? error.message : 'Internal server error' });
      else res.end();
    });
  });
  server.listen(PORT, () => log('info', 'server listening', { port: PORT, base_url: BASE_URL }));
  const worker = setInterval(workerTick, 3000);
  worker.unref();
  const reconciler = setInterval(expirePendingCancellations, 60000);
  reconciler.unref();
  return server;
}

if (require.main === module) start();

module.exports = {
  verifyWebhookSignature,
  createAppJwt,
  planTier,
  featuresForTier,
  makeSignedToken,
  readSignedToken,
  processWebhookDelivery,
  start,
};
const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const originalCreateServer = http.createServer;

function timingSafeEqualText(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function requireAdmin(req) {
  const expected = process.env.ADMIN_TOKEN || '';
  return Boolean(expected && timingSafeEqualText(req.headers['x-admin-token'] || '', expected));
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function captureRequest(listener, req, pathOverride) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Readiness capture timed out'));
      }
    }, 5000);
    timeout.unref?.();

    const captured = {
      headersSent: false,
      statusCode: 200,
      headers: {},
      writeHead(status, headers = {}) {
        this.statusCode = status;
        this.headers = { ...this.headers, ...headers };
        this.headersSent = true;
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(chunk = '') {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({
            status: this.statusCode,
            headers: this.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        }
      },
    };

    const forwarded = Object.create(req);
    forwarded.url = pathOverride;

    try {
      listener(forwarded, captured);
    } catch (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    }
  });
}

function parseReadiness(result) {
  let body = {};
  try { body = JSON.parse(result.body || '{}'); } catch {}
  return {
    ok: result.status === 200 && body.ok === true,
    checks: body && typeof body.checks === 'object' && body.checks ? body.checks : {},
  };
}

async function handlePublicReadiness(listener, req, res) {
  try {
    const readiness = parseReadiness(await captureRequest(listener, req, '/health/ready'));
    const ok = readiness.ok && Boolean(process.env.ADMIN_TOKEN);
    return writeJson(res, ok ? 200 : 503, { ok });
  } catch {
    return writeJson(res, 503, { ok: false });
  }
}

async function handleAdminReadiness(listener, req, res) {
  if (!requireAdmin(req)) return writeJson(res, 401, { error: 'Unauthorized' });
  try {
    const readiness = parseReadiness(await captureRequest(listener, req, '/health/ready'));
    const checks = { ...readiness.checks, admin_token: true };
    const ok = readiness.ok && Object.values(checks).every(Boolean);
    return writeJson(res, ok ? 200 : 503, {
      ok,
      checks,
      checked_at: new Date().toISOString(),
    });
  } catch {
    return writeJson(res, 503, {
      ok: false,
      checks: { readiness_probe: false, admin_token: true },
      checked_at: new Date().toISOString(),
    });
  }
}

http.createServer = function hardenedCreateServer(listener) {
  return originalCreateServer.call(http, (req, res) => {
    let pathname = '/';
    try { pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname; } catch {}

    if (req.method === 'GET' && pathname === '/health/ready') {
      handlePublicReadiness(listener, req, res).catch(() => writeJson(res, 503, { ok: false }));
      return;
    }

    if (req.method === 'GET' && pathname === '/admin/health/ready') {
      handleAdminReadiness(listener, req, res).catch(() => writeJson(res, 503, { ok: false }));
      return;
    }

    listener(req, res);
  });
};

try {
  const { start } = require('./server');
  start();
} finally {
  http.createServer = originalCreateServer;
}

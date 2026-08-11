const { callAI } = require('./ai_v3');
const fs = require('fs');
const path = require('path');

const RATE_LIMIT_WINDOW_MS = Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.AI_RATE_LIMIT_MAX || 30);
const REQUEST_LOG = path.join(__dirname, '..', 'data', 'ai_requests.json');

const ipMap = new Map(); // simple in-memory rate limiter (staging preview only)

function getIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  let st = ipMap.get(ip);
  if (!st || (now - st.windowStart) > RATE_LIMIT_WINDOW_MS) {
    st = { windowStart: now, count: 0 };
  }
  st.count += 1;
  ipMap.set(ip, st);
  return st.count <= RATE_LIMIT_MAX;
}

async function appendRequestLog(entry) {
  try {
    await fs.promises.mkdir(path.dirname(REQUEST_LOG), { recursive: true });
    let arr = [];
    try { arr = JSON.parse(await fs.promises.readFile(REQUEST_LOG, 'utf8') || '[]'); } catch (e) { arr = []; }
    arr.push(entry);
    await fs.promises.writeFile(REQUEST_LOG, JSON.stringify(arr.slice(-1000), null, 2), 'utf8');
  } catch (e) {
    console.warn('appendRequestLog error', e && e.message);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  let body = req.body;
  if (!body) {
    try {
      const raw = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(data));
      });
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      body = {};
    }
  }

  const ip = getIp(req);

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'rate_limited', message: 'Rate limit exceeded' });
  }

  // Support templates: if body.template is set, load from data/prompt-templates.json
  let prompt = '';
  if (body && body.template) {
    try {
      const tplFile = path.join(__dirname, '..', 'data', 'prompt-templates.json');
      const tplRaw = await fs.promises.readFile(tplFile, 'utf8');
      const tplObj = JSON.parse(tplRaw || '{}');
      const tpl = tplObj[body.template];
      const context = (body.context || body.prompt || '');
      if (tpl) {
        prompt = tpl.replace(/{{\s*context\s*}}/g, context);
      } else {
        prompt = context || 'Summarise the R.I.C.H.O. Product Runtime Hub in one short paragraph.';
      }
    } catch (e) {
      prompt = (body.prompt || body.message) || 'Summarise the R.I.C.H.O. Product Runtime Hub in one short paragraph.';
    }
  } else {
    prompt = (body && (body.prompt || body.message)) || 'Summarise the R.I.C.H.O. Product Runtime Hub in one short paragraph.';
  }

  const start = Date.now();
  try {
    const result = await callAI({ prompt, model: process.env.AI_MODEL || 'gpt-4o', max_tokens: 400 });
    const duration = Date.now() - start;
    await appendRequestLog({ ts: new Date().toISOString(), ip, prompt: prompt.slice(0, 1000), provider: process.env.AI_PROVIDER || 'mock', model: process.env.AI_MODEL || 'gpt-4o', durationMs: duration, success: true });
    return res.status(200).json({ ok: true, text: result.text, raw: result.raw || null, usedTemplate: body && body.template ? body.template : null });
  } catch (err) {
    const duration = Date.now() - start;
    await appendRequestLog({ ts: new Date().toISOString(), ip, prompt: prompt.slice(0, 1000), provider: process.env.AI_PROVIDER || 'mock', model: process.env.AI_MODEL || 'gpt-4o', durationMs: duration, success: false, error: (err && (err.message || String(err))).slice(0, 1000) });
    console.error('demo-assistant error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: 'AI provider error' });
  }
};

/* api/ai_v3.js
 * Provider-agnostic AI caller with safety guards and usage accounting
 * Env:
 *  - AI_PROVIDER: 'mock' (default) | 'openai'
 *  - OPENAI_API_KEY: required if AI_PROVIDER=openai
 *  - AI_MODEL: optional model override (default: gpt-4o)
 *  - AI_MAX_TOKENS: per-request cap (default: 500)
 *  - AI_DAILY_TOKEN_LIMIT: daily token cap for provider calls (default: 50000)
 *
 * Writes call logs to data/ai_calls.json and usage to data/ai_usage.json (staging preview only)
 */

const fs = require('fs');
const path = require('path');

const provider = process.env.AI_PROVIDER || 'mock';
const LOG_FILE = path.join(__dirname, '..', 'data', 'ai_calls.json');
const USAGE_FILE = path.join(__dirname, '..', 'data', 'ai_usage.json');

async function ensureJsonFile(filePath, initial = '[]') {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    try { await fs.promises.access(filePath); } catch (e) { await fs.promises.writeFile(filePath, initial, 'utf8'); }
  } catch (e) {
    // ignore
  }
}

async function appendJson(filePath, entry, maxEntries = 1000) {
  try {
    await ensureJsonFile(filePath);
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const arr = JSON.parse(raw || '[]');
    arr.push(entry);
    await fs.promises.writeFile(filePath, JSON.stringify(arr.slice(-maxEntries), null, 2), 'utf8');
  } catch (e) {
    console.warn('appendJson error', e && e.message);
  }
}

function estimateTokens(prompt, max_tokens) {
  // rough approximation: 1 token ~= 4 characters
  const pChars = String(prompt || '').length;
  return Math.ceil(pChars / 4) + Number(max_tokens || 0);
}

async function checkDailyBudget(tokens) {
  const limit = Number(process.env.AI_DAILY_TOKEN_LIMIT || 50000);
  try {
    await ensureJsonFile(USAGE_FILE);
    const raw = await fs.promises.readFile(USAGE_FILE, 'utf8');
    const arr = JSON.parse(raw || '[]');
    const today = new Date().toISOString().slice(0, 10);
    const todays = arr.filter(r => r.date === today).reduce((s, r) => s + (Number(r.tokens) || 0), 0);
    if (todays + tokens > limit) throw new Error('Daily AI token limit exceeded');
    return true;
  } catch (e) {
    // propagate error if explicit limit exceeded, otherwise warn
    if (e && String(e).includes('Daily AI token limit exceeded')) throw e;
    console.warn('checkDailyBudget warning', e && (e.message || e));
    return true;
  }
}

async function recordUsage(tokens) {
  try {
    await appendJson(USAGE_FILE, { date: new Date().toISOString().slice(0,10), ts: new Date().toISOString(), tokens });
  } catch (e) { console.warn('recordUsage warning', e && e.message); }
}

async function logCall(entry) {
  await appendJson(LOG_FILE, entry);
}

async function callAI({ prompt, model = process.env.AI_MODEL || 'gpt-4o', max_tokens = 256 } = {}) {
  if (!prompt) throw new Error('prompt required');
  const start = Date.now();
  const entry = { ts: new Date().toISOString(), provider, model, prompt: (prompt||'').slice(0, 1000), success: false };

  // enforce per-request cap
  const ENV_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 500);
  max_tokens = Math.min(Number(max_tokens || 0), ENV_MAX_TOKENS);

  const estimated = estimateTokens(prompt, max_tokens);

  try {
    if (provider === 'mock') {
      const text = `MOCK RESPONSE: ${prompt.slice(0, 200)}${prompt.length > 200 ? '...' : ''}`;
      entry.durationMs = Date.now() - start;
      entry.success = true;
      await logCall(entry);
      return { text };
    }

    if (provider === 'openai') {
      // safety: check daily budget before calling
      await checkDailyBudget(estimated);

      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('OPENAI_API_KEY is required for provider=openai');

      const fetcher = globalThis.fetch;
      if (!fetcher) throw new Error('fetch is not available in this runtime; require Node 18+ or polyfill');

      const payload = { model, messages: [{ role: 'user', content: prompt }], max_tokens };

      const res = await fetcher('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const duration = Date.now() - start;

      if (!res.ok) {
        const errText = await res.text();
        entry.durationMs = duration;
        entry.error = errText.slice(0, 1000);
        await logCall(entry);
        throw new Error('OpenAI error: ' + errText);
      }

      const body = await res.json();
      const text = body.choices?.[0]?.message?.content || body.choices?.[0]?.text || '';

      // record usage (best-effort)
      await recordUsage(estimated);

      entry.durationMs = duration;
      entry.success = true;
      await logCall(entry);
      return { text, raw: body };
    }

    throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  } catch (err) {
    entry.error = (err && (err.message || String(err))).slice(0, 1000);
    entry.durationMs = Date.now() - start;
    try { await logCall(entry); } catch (e) {}
    throw err;
  }
}

module.exports = { callAI, provider };

/* api/ai_v2.js
 * Improved provider-agnostic AI caller with call logging
 * Env:
 *  - AI_PROVIDER: 'mock' (default) | 'openai'
 *  - OPENAI_API_KEY: required if AI_PROVIDER=openai
 *  - AI_MODEL: optional model override (default: gpt-4o)
 *
 * Writes call logs to data/ai_calls.json (staging preview only)
 */

const fs = require('fs');
const path = require('path');

const provider = process.env.AI_PROVIDER || 'mock';
const LOG_FILE = path.join(__dirname, '..', 'data', 'ai_calls.json');

async function ensureLogStore() {
  try {
    await fs.promises.mkdir(path.dirname(LOG_FILE), { recursive: true });
    try { await fs.promises.access(LOG_FILE); } catch (e) { await fs.promises.writeFile(LOG_FILE, '[]', 'utf8'); }
  } catch (e) {
    // ignore
  }
}

async function logCall(entry) {
  try {
    await ensureLogStore();
    const raw = await fs.promises.readFile(LOG_FILE, 'utf8');
    const arr = JSON.parse(raw || '[]');
    arr.push(entry);
    await fs.promises.writeFile(LOG_FILE, JSON.stringify(arr.slice(-1000), null, 2), 'utf8');
  } catch (e) {
    console.warn('ai_v2 log error', e && e.message);
  }
}

async function callAI({ prompt, model = process.env.AI_MODEL || 'gpt-4o', max_tokens = 256 } = {}) {
  if (!prompt) throw new Error('prompt required');
  const start = Date.now();
  const entry = { ts: new Date().toISOString(), provider, model, prompt: (prompt||'').slice(0, 1000), success: false };

  try {
    if (provider === 'mock') {
      const text = `MOCK RESPONSE: ${prompt.slice(0, 200)}${prompt.length > 200 ? '...' : ''}`;
      entry.durationMs = Date.now() - start;
      entry.success = true;
      await logCall(entry);
      return { text };
    }

    if (provider === 'openai') {
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

/* api/ai.js
 * Provider-agnostic AI caller (staging stub)
 * Env:
 *  - AI_PROVIDER: 'mock' (default) | 'openai'
 *  - OPENAI_API_KEY: required if AI_PROVIDER=openai
 *
 * Exports: callAI({ prompt, model, max_tokens }) -> { text, raw? }
 */

const provider = process.env.AI_PROVIDER || 'mock';

async function callAI({ prompt, model = 'gpt-4o', max_tokens = 256 } = {}) {
  if (!prompt) throw new Error('prompt required');
  if (provider === 'mock') {
    // deterministic mock useful for previews and tests
    return { text: `MOCK RESPONSE: ${prompt.slice(0, 200)}${prompt.length > 200 ? '...' : ''}` };
  }

  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is required for provider=openai');

    // Node 18+ has global fetch; for older nodes replace with node-fetch or axios
    const payload = {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error('OpenAI error: ' + err);
    }

    const body = await res.json();
    const text = body.choices?.[0]?.message?.content || body.choices?.[0]?.text || '';
    return { text, raw: body };
  }

  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}

module.exports = { callAI };

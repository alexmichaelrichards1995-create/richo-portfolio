const { callAI } = require('./ai');

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

  const prompt = (body && (body.prompt || body.message)) || 'Summarise the R.I.C.H.O. Product Runtime Hub in one short paragraph.';

  try {
    const result = await callAI({ prompt, model: process.env.AI_MODEL || 'gpt-4o', max_tokens: 200 });
    return res.status(200).json({ ok: true, text: result.text, raw: result.raw || null });
  } catch (err) {
    console.error('demo-assistant error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: 'AI provider error' });
  }
};

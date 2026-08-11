const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  let body = req.body;
  if (!body) {
    // attempt to parse raw body
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

  const { name, email, company, product, message } = body || {};
  if (!email || !product) {
    return res.status(400).json({ error: 'email and product are required' });
  }

  const lead = { id: Date.now(), name: name || '', email, company: company || '', product, message: message || '', receivedAt: new Date().toISOString() };
  console.log('lead received:', lead);

  // Best-effort persistence for the staging preview: write to repo-local data/leads.json
  try {
    const storageDir = path.join(__dirname, '..', 'data');
    await fs.promises.mkdir(storageDir, { recursive: true });
    const file = path.join(storageDir, 'leads.json');
    let leads = [];
    try { leads = JSON.parse(await fs.promises.readFile(file, 'utf8') || '[]'); } catch (e) { leads = []; }
    leads.push(lead);
    await fs.promises.writeFile(file, JSON.stringify(leads, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not persist lead to file store:', e && e.message);
  }

  // If configured, forward lead to CRM webhook (staging/prod). Non-blocking; failures are logged.
  const crmUrl = process.env.CRM_WEBHOOK_URL;
  if (crmUrl) {
    try {
      const payload = { lead };
      if (typeof fetch !== 'undefined') {
        await fetch(crmUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        const https = require('https');
        const urlObj = new URL(crmUrl);
        const options = { hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'POST', headers: { 'Content-Type': 'application/json' } };
        await new Promise((resolve, reject) => {
          const r = https.request(options, (res2) => { res2.on('data', () => {}); res2.on('end', resolve); });
          r.on('error', reject);
          r.write(JSON.stringify(payload));
          r.end();
        });
      }
    } catch (err) {
      console.warn('Failed to forward lead to CRM webhook:', err && (err.message || err));
    }
  }

  return res.status(201).json({ ok: true, lead, forwarded: !!crmUrl });
};

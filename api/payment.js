const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  const base = path.join(__dirname, '..', 'data');
  await fs.promises.mkdir(base, { recursive: true });
  const file = path.join(base, 'payments.json');

  if (req.method === 'POST') {
    let body = req.body;
    if (!body) {
      try {
        const raw = await new Promise((resolve) => { let data = ''; req.on('data', c => data += c); req.on('end', () => resolve(data)); });
        body = raw ? JSON.parse(raw) : {};
      } catch (e) { body = {}; }
    }
    const { email, product, amountCents } = body || {};
    if (!email || !product || !amountCents) return res.status(400).json({ error: 'email, product, amountCents required' });
    const payment = { id: Date.now(), email, product, amountCents, status: 'succeeded', createdAt: new Date().toISOString() };
    try {
      const arr = JSON.parse(await fs.promises.readFile(file, 'utf8') || '[]');
      arr.push(payment);
      await fs.promises.writeFile(file, JSON.stringify(arr.slice(-1000), null, 2), 'utf8');
    } catch (e) {
      await fs.promises.writeFile(file, JSON.stringify([payment], null, 2), 'utf8');
    }
    return res.status(201).json({ ok: true, payment });
  }

  if (req.method === 'GET') {
    try {
      const arr = JSON.parse(await fs.promises.readFile(file, 'utf8') || '[]');
      return res.status(200).json({ ok: true, payments: arr });
    } catch (e) {
      return res.status(200).json({ ok: true, payments: [] });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end('Method Not Allowed');
};

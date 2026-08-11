const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const header = req.headers['x-admin-secret'] || req.headers['x-admin-token'];
    if (!header || header !== adminSecret) return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const file = path.join(__dirname, '..', 'data', 'leads.json');
    const raw = await fs.promises.readFile(file, 'utf8');
    const leads = JSON.parse(raw || '[]');
    return res.status(200).json({ ok: true, leads });
  } catch (e) {
    return res.status(200).json({ ok: true, leads: [] });
  }
};

const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }
  try {
    const file = path.join(__dirname, '..', 'data', 'prompt-templates.json');
    const raw = await fs.promises.readFile(file, 'utf8');
    const obj = JSON.parse(raw || '{}');
    return res.status(200).json({ ok: true, templates: obj });
  } catch (e) {
    return res.status(200).json({ ok: true, templates: {} });
  }
};

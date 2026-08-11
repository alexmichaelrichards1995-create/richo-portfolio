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

  const base = path.join(__dirname, '..', 'data');
  const callsFile = path.join(base, 'ai_calls.json');
  const reqFile = path.join(base, 'ai_requests.json');
  let calls = [], requests = [];
  try { calls = JSON.parse(await fs.promises.readFile(callsFile, 'utf8') || '[]'); } catch (e) { calls = []; }
  try { requests = JSON.parse(await fs.promises.readFile(reqFile, 'utf8') || '[]'); } catch (e) { requests = []; }
  return res.status(200).json({ ok: true, calls, requests });
};

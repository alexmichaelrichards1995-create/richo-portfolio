const jwt = require('jsonwebtoken');

exports.handler = async function(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const org_id = body.org_id || (event.queryStringParameters && event.queryStringParameters.org_id);
    if (!org_id) return { statusCode: 400, body: JSON.stringify({ error: 'missing org_id' }) };
    const TOKEN_SECRET = process.env.TOKEN_SECRET || 'change-me-please';
    const token = jwt.sign({ org_id }, TOKEN_SECRET, { expiresIn: '60s' });
    return { statusCode: 200, body: JSON.stringify({ token, expires_in: 60 }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};

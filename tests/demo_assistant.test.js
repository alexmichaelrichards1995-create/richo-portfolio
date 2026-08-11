(async function() {
  const handler = require('../api/demo-assistant');
  const req = { method: 'POST', body: { prompt: 'Summarise the R.I.C.H.O. Product Runtime Hub in one sentence.' }, headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  let status = 200;
  let payload = null;
  const res = {
    status(code) { status = code; return this; },
    json(obj) { payload = obj; return this; },
    end(s) { payload = payload || s; return this; }
  };

  try {
    await handler(req, res);
    if (status !== 200) {
      console.error('demo assistant returned non-200', status, payload);
      process.exit(1);
    }
    if (!payload || !payload.text) {
      console.error('demo assistant did not return text', payload);
      process.exit(1);
    }
    console.log('demo assistant test passed');
  } catch (err) {
    console.error('demo assistant test failed', err);
    process.exit(1);
  }
})();

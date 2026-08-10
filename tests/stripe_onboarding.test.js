// Lightweight tests for stripe_onboarding routes (scaffolded)
const express = require('express');
const request = require('supertest');

const { router } = require('../stripe_onboarding');

(async () => {
  const app = express();
  app.use(router);

  // Test onboard start without accountId -> 400
  let res = await request(app).post('/stripe/onboard/start').send({});
  if (res.status !== 400) { console.error('FAILED: expected 400 for missing accountId'); process.exit(1); }

  // Test onboard start with accountId -> 200
  res = await request(app).post('/stripe/onboard/start').send({ accountId: 1234, login: 'org', email: 'a@b.com' });
  if (res.status !== 200) { console.error('FAILED: expected 200 for onboard start'); process.exit(1); }

  // Test webhook endpoint accepts JSON when no STRIPE_WEBHOOK_SECRET set
  res = await request(app).post('/stripe/webhook').send({ type: 'account.updated' });
  if (res.status !== 200) { console.error('FAILED: expected 200 for webhook'); process.exit(1); }

  console.log('OK: stripe_onboarding routes smoke tests passed');
  process.exit(0);
})();

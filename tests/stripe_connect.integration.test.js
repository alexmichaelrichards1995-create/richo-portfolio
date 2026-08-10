// Integration test for stripe_connect — uses stub path when STRIPE_API_KEY not set
// Run: node tests/stripe_connect.integration.test.js

(async () => {
  try {
    const stripeConnect = require('../stripe_connect');
    const envKey = process.env.STRIPE_API_KEY;
    const org = { accountId: 12345, login: 'acme', email: 'devnull@example.com' };

    const res = await stripeConnect.createConnectAccount(org);
    if (!res || !res.accountId) throw new Error('createConnectAccount did not return accountId');

    // executePayout should return scheduled:false when below threshold
    const payout = await stripeConnect.executePayout('2026-06', 10000, res.accountId, { minPayoutCents: 50000 });
    if (payout.scheduled) throw new Error('payout scheduled unexpectedly');

    console.log('OK: stripe_connect integration (stub) passed', { STRIPE_API_KEY: !!envKey });
    process.exit(0);
  } catch (err) {
    console.error('FAILED', err && err.message);
    process.exit(1);
  }
})();
// Integration test for Stripe Connect safety behavior when Stripe is not configured.
// No network calls or fake connected-account IDs are permitted in this path.

(async () => {
  try {
    delete process.env.STRIPE_API_KEY;
    const stripeConnect = require('../stripe_connect');
    const org = { accountId: 12345, login: 'acme', email: 'devnull@example.com' };

    const account = await stripeConnect.createConnectAccount(org);
    if (!account || account.connected !== false || account.accountId !== null || account.state !== 'UNCONFIGURED') {
      throw new Error('unconfigured Stripe Connect must return an explicit non-connected state');
    }

    const belowThreshold = await stripeConnect.executePayout('2026-06', 10000, null, {
      minPayoutCents: 50000,
    });
    if (belowThreshold.success !== false || belowThreshold.scheduled !== false) {
      throw new Error('below-threshold payout should remain unscheduled');
    }

    const unconfiguredPayout = await stripeConnect.executePayout('2026-06', 100000, null, {
      minPayoutCents: 50000,
    });
    if (
      unconfiguredPayout.success !== false ||
      unconfiguredPayout.scheduled !== false ||
      unconfiguredPayout.state !== 'UNCONFIGURED'
    ) {
      throw new Error('payout must fail closed when Stripe is unconfigured');
    }

    console.log('OK: Stripe Connect unconfigured path fails closed without fake account IDs or payouts');
    process.exit(0);
  } catch (err) {
    console.error('FAILED', err && err.message);
    process.exit(1);
  }
})();

// Integration test for legacy Stripe Connect safety behavior.
// No network calls or fake connected-account IDs are permitted in this path.

(async () => {
  try {
    delete process.env.STRIPE_CONNECT_SECRET_KEY;
    delete process.env.RICHO_MARKETPLACE_CONNECT_ENABLED;
    delete process.env.RICHO_LIVE_PAYOUTS_ENABLED;

    const stripeConnect = require('../stripe_connect');
    const org = { accountId: 12345, login: 'acme', email: 'devnull@example.com' };

    const account = await stripeConnect.createConnectAccount(org);
    if (!account || account.connected !== false || account.accountId !== null || account.state !== 'UNCONFIGURED') {
      throw new Error('unconfigured Stripe Connect must return an explicit non-connected state');
    }

    if (stripeConnect.connectEnabled() !== false || stripeConnect.payoutsEnabled() !== false) {
      throw new Error('Marketplace Connect and payout gates must default to disabled');
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
      throw new Error('payout must fail closed when Stripe Connect is unconfigured');
    }

    console.log('OK: Stripe Connect and payouts default to fail-closed states');
    process.exit(0);
  } catch (err) {
    console.error('FAILED', err && err.message);
    process.exit(1);
  }
})();

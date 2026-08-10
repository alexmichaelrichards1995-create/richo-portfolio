// Tests for stripe_payouts runner (unit smoke)
// Run: node tests/stripe_payouts.test.js

const { runPayouts } = require('../stripe_payouts');

(async () => {
  try {
    // Run with very low threshold to exercise logic using file-store or DB
    await runPayouts({ minPayoutCents: 1 });
    console.log('OK: stripe_payouts runner executed (smoke)');
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err && err.message);
    process.exit(1);
  }
})();

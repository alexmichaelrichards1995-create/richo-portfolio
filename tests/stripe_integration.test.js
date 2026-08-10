// Tests for stripe_integration.js
// Run: node tests/stripe_integration.test.js

const { calculateNetRevenue, schedulePayout } = require('../stripe_integration');

(async () => {
  try {
    // commission calc
    const gross = 600000; // $6,000.00
    const { grossCents, commissionCents, netCents } = calculateNetRevenue(gross);
    if (grossCents !== gross) throw new Error('gross mismatch');
    if (commissionCents <= 0) throw new Error('commission should be >0');
    if (netCents !== gross - commissionCents) throw new Error('net calc mismatch');

    // payout scheduling threshold
    const below = await schedulePayout('2026-06', 40000); // $400 -> below default $500 threshold
    if (below.scheduled) throw new Error('should not schedule below min');

    const above = await schedulePayout('2026-06', 600000); // $6,000
    if (!above.scheduled) throw new Error('should schedule above min');

    console.log('OK: stripe_integration basic tests passed');
    process.exit(0);
  } catch (err) {
    console.error('FAILED', err && err.message);
    process.exit(1);
  }
})();
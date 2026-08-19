/* stripe_integration.js
 * Minimal payout/revenue calculation stubs.
 * - calculateNetRevenue applies GitHub commission (5%) and returns cents
 * - schedulePayout stub: returns payout metadata when MRR threshold met
 */

const GITHUB_COMMISSION_BPS = 500; // 5% expressed as basis points

function calculateNetRevenue(grossCents) {
  const commission = Math.round((grossCents * GITHUB_COMMISSION_BPS) / 10000);
  const net = grossCents - commission;
  return { grossCents, commissionCents: commission, netCents: net };
}

async function schedulePayout(month, grossCents, options = {}) {
  // options: { minPayoutCents }
  const minPayoutCents = options.minPayoutCents || 50000; // $500 default
  const { netCents } = calculateNetRevenue(grossCents);
  if (netCents < minPayoutCents) return { scheduled: false, reason: 'below_min_payout', netCents };

  // In real impl: create Stripe Connect transfer or ledger entry
  const payout = {
    month,
    grossCents,
    netCents,
    scheduledAt: new Date().toISOString(),
    payoutMethod: 'stripe_connect',
  };
  return { scheduled: true, payout };
}

module.exports = { calculateNetRevenue, schedulePayout };

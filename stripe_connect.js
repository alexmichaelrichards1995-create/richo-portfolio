/* stripe_connect.js
 * Stripe Connect + payout scaffolds
 * - createConnectAccount: stub for onboarding connected account
 * - executePayout: stub for creating a payout when net revenue >= threshold
 * Real implementation should use stripe library and handle KYC, errors, retries.
 */

const { schedulePayout, calculateNetRevenue } = require('./stripe_integration');

async function createConnectAccount(org) {
  // org: { accountId, login, email }
  // In production: call stripe.accounts.create and persist mapping
  console.log('createConnectAccount (stub)', org);
  return { connected: true, accountId: `acct_stub_${org.accountId}` };
}

async function executePayout(month, grossCents, connectedAccountId, options = {}) {
  // Calculate net, check threshold, then schedule via Stripe Connect
  const { scheduled, payout, reason } = await schedulePayout(month, grossCents, { minPayoutCents: options.minPayoutCents });
  if (!scheduled) return { success: false, reason };

  // In real impl: call Stripe API to create transfer to connectedAccountId
  console.log('executePayout stub', { month, grossCents, connectedAccountId, payout });
  return { success: true, payout };
}

module.exports = { createConnectAccount, executePayout };

/* stripe_connect.js
 * Stripe Connect + payout scaffolds
 * - createConnectAccount: stub for onboarding connected account
 * - executePayout: stub for creating a payout when net revenue >= threshold
 * Real implementation should use stripe library and handle KYC, errors, retries.
 */

const { schedulePayout, calculateNetRevenue } = require('./stripe_integration');

let stripe = null;
if (process.env.STRIPE_API_KEY) {
  try { stripe = require('stripe')(process.env.STRIPE_API_KEY); } catch (e) { stripe = null; }
}

async function createConnectAccount(org) {
  // org: { accountId, login, email }
  if (stripe) {
    // Minimal create account flow — in production handle KYC and account capabilities
    const acct = await stripe.accounts.create({ type: 'standard', email: org.email || undefined });
    // Persist mapping acct.id -> org.accountId in your DB
    return { connected: true, accountId: acct.id };
  }
  // Fallback stub
  console.log('createConnectAccount (stub)', org);
  return { connected: true, accountId: `acct_stub_${org.accountId}` };
}

async function executePayout(month, grossCents, connectedAccountId, options = {}) {
  const { scheduled, payout, reason } = await schedulePayout(month, grossCents, { minPayoutCents: options.minPayoutCents });
  if (!scheduled) return { success: false, reason };

  if (stripe) {
    // In real impl: create a payout/transfer to connectedAccountId via Stripe Connect
    // This requires the connected account to be fully onboarded and have a balance
    // Placeholder: create a transfer in test mode
    const transfer = await stripe.transfers.create({ amount: payout.netCents, currency: 'usd', destination: connectedAccountId });
    return { success: true, payout: { ...payout, transferId: transfer.id } };
  }

  console.log('executePayout stub', { month, grossCents, connectedAccountId, payout });
  return { success: true, payout };
}

module.exports = { createConnectAccount, executePayout };

/* stripe_connect.js
 * Stripe Connect + payout scaffolds
 * - createConnectAccount: stub for onboarding connected account
 * - executePayout: stub for creating a payout when net revenue >= threshold
 * Real implementation should use stripe library and handle KYC, errors, retries.
 */

const { schedulePayout, calculateNetRevenue } = require('./stripe_integration');
const db = require('./db/db_client');

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
    try { await db.upsertConnectedAccount(org.accountId, acct.id, 'pending'); } catch (e) { console.warn('db upsertConnectedAccount failed', e && e.message); }
    return { connected: true, accountId: acct.id };
  }
  // Fallback stub
  const stubId = `acct_stub_${org.accountId}`;
  console.log('createConnectAccount (stub)', org);
  try { await db.upsertConnectedAccount(org.accountId, stubId, 'connected'); } catch (e) { console.warn('db upsertConnectedAccount failed (stub)', e && e.message); }
  return { connected: true, accountId: stubId };
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

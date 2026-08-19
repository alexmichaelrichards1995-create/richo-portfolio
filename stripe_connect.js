/* stripe_connect.js
 * Stripe Connect + payout scaffolds.
 * Safety rule: absence of Stripe configuration is UNCONFIGURED, never a fake
 * successful connected-account or payout result.
 */

const { schedulePayout } = require('./stripe_integration');

let stripe = null;
if (process.env.STRIPE_API_KEY) {
  try {
    stripe = require('stripe')(process.env.STRIPE_API_KEY);
  } catch {
    stripe = null;
  }
}

async function createConnectAccount(org) {
  if (!org || !org.accountId) throw new Error('accountId required');

  if (!stripe) {
    return {
      connected: false,
      accountId: null,
      state: 'UNCONFIGURED',
      reason: 'STRIPE_API_KEY is not configured',
    };
  }

  const acct = await stripe.accounts.create({
    type: 'standard',
    email: org.email || undefined,
    metadata: {
      richo_marketplace_account_id: String(org.accountId),
      richo_marketplace_login: org.login || '',
    },
  });

  return { connected: true, accountId: acct.id, state: 'CREATED' };
}

async function executePayout(month, grossCents, connectedAccountId, options = {}) {
  const { scheduled, payout, reason } = await schedulePayout(month, grossCents, {
    minPayoutCents: options.minPayoutCents,
  });

  if (!scheduled) return { success: false, scheduled: false, reason };

  if (!stripe) {
    return {
      success: false,
      scheduled: false,
      state: 'UNCONFIGURED',
      reason: 'STRIPE_API_KEY is not configured',
      payout,
    };
  }

  if (!connectedAccountId) {
    return {
      success: false,
      scheduled: false,
      state: 'BLOCKED',
      reason: 'connectedAccountId is required for Stripe payout execution',
      payout,
    };
  }

  const transfer = await stripe.transfers.create({
    amount: payout.netCents,
    currency: 'usd',
    destination: connectedAccountId,
  });

  return {
    success: true,
    scheduled: true,
    payout: { ...payout, transferId: transfer.id },
  };
}

module.exports = { createConnectAccount, executePayout };

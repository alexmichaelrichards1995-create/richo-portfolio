/* stripe_connect.js
 * Legacy Stripe Connect + payout compatibility scaffold.
 *
 * Safety rules:
 * - Missing Stripe configuration is UNCONFIGURED, never a fake success.
 * - Connect account creation requires RICHO_MARKETPLACE_CONNECT_ENABLED=true.
 * - Money movement additionally requires RICHO_LIVE_PAYOUTS_ENABLED=true.
 * - Customer-commerce Stripe credentials are not reused here.
 */

const { schedulePayout } = require('./stripe_integration');

let stripe = null;
if (process.env.STRIPE_CONNECT_SECRET_KEY) {
  try {
    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_CONNECT_SECRET_KEY);
  } catch {
    stripe = null;
  }
}

function connectEnabled() {
  return process.env.RICHO_MARKETPLACE_CONNECT_ENABLED === 'true';
}

function payoutsEnabled() {
  return process.env.RICHO_LIVE_PAYOUTS_ENABLED === 'true';
}

async function createConnectAccount(org) {
  if (!org || !org.accountId) throw new Error('accountId required');

  if (!stripe) {
    return {
      connected: false,
      accountId: null,
      state: 'UNCONFIGURED',
      reason: 'STRIPE_CONNECT_SECRET_KEY is not configured',
    };
  }

  if (!connectEnabled()) {
    return {
      connected: false,
      accountId: null,
      state: 'BLOCKED',
      reason: 'R.I.C.H.O. Marketplace Connect is disabled',
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
      reason: 'STRIPE_CONNECT_SECRET_KEY is not configured',
      payout,
    };
  }

  if (!connectEnabled()) {
    return {
      success: false,
      scheduled: false,
      state: 'BLOCKED',
      reason: 'R.I.C.H.O. Marketplace Connect is disabled',
      payout,
    };
  }

  if (!payoutsEnabled()) {
    return {
      success: false,
      scheduled: false,
      state: 'BLOCKED',
      reason: 'R.I.C.H.O. live payouts are disabled',
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

module.exports = {
  createConnectAccount,
  executePayout,
  connectEnabled,
  payoutsEnabled,
};

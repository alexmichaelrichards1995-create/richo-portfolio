/* subscriptions_service.js
 * Subscription persistence service.
 */

const dbClient = require('./db/db_client');
const { normalizeMarketplaceSubscription } = require('./shared/subscription_model');

async function upsertSubscription(accountId, purchase, action = 'changed', options = {}) {
  if (!accountId) throw new Error('accountId required');

  const normalized = normalizeMarketplaceSubscription(action, purchase);
  const record = {
    accountId,
    account_login: (purchase && purchase.account && purchase.account.login) || null,
    plan_id: normalized.planId,
    plan_name: normalized.planName,
    monthly_price_in_cents: normalized.monthlyPriceInCents,
    tier: normalized.tier,
    status: normalized.status,
    effective_at: normalized.effectiveAt ? normalized.effectiveAt.toISOString() : null,
    billing_cycle_start: null,
    updated_at: new Date().toISOString(),
  };

  const res = await dbClient.upsertSubscription(accountId, record, { client: options.client });
  return { upserted: true, record: res };
}

async function getSubscription(accountId) {
  return dbClient.getSubscription(accountId);
}

module.exports = { upsertSubscription, getSubscription };

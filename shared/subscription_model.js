const FREE_PLAN_NAME = 'Free';
const EFFECTIVE_DATE_BUFFER_MS = 1000;

function normalizePlanName(name) {
  const value = String(name || '').trim();
  return value || FREE_PLAN_NAME;
}

function planTier(planName = '') {
  const name = normalizePlanName(planName).toLowerCase();
  if (name.includes('enterprise')) return 'enterprise';
  if (name.includes('business')) return 'business';
  if (name.includes('professional') || name === 'pro') return 'professional';
  if (name.includes('starter')) return 'starter';
  return 'free';
}

function featuresForTier(tier = 'free') {
  const normalized = String(tier || 'free').toLowerCase();
  const base = ['repository_health', 'basic_pr_checks'];
  if (normalized === 'starter') return [...base, 'basic_security'];
  if (normalized === 'professional') return [...base, 'basic_security', 'advanced_analytics', 'api_access', 'team_collaboration'];
  if (normalized === 'business') return [...base, 'basic_security', 'advanced_analytics', 'api_access', 'team_collaboration', 'policy_engine', 'priority_support'];
  if (normalized === 'enterprise') return [...base, 'basic_security', 'advanced_analytics', 'api_access', 'team_collaboration', 'policy_engine', 'priority_support', 'sso', 'audit_exports', 'custom_integrations'];
  return base;
}

function deriveStatus(action, tier, effectiveAt = null) {
  if (action === 'cancelled') {
    if (effectiveAt && effectiveAt.getTime() > Date.now() + EFFECTIVE_DATE_BUFFER_MS) return 'cancellation_pending';
    return 'free';
  }
  return tier === 'free' ? 'free' : 'active';
}

function normalizeMarketplaceSubscription(action, purchase = {}) {
  const plan = purchase.plan || {};
  const planName = normalizePlanName(plan.name);
  const tier = action === 'cancelled' && !purchase.effective_date ? 'free' : planTier(planName);
  const effectiveAt = purchase.effective_date ? new Date(purchase.effective_date) : null;
  const status = deriveStatus(action, tier, effectiveAt);

  return {
    planId: plan.id || null,
    planName: action === 'cancelled' && status === 'free' ? FREE_PLAN_NAME : planName,
    monthlyPriceInCents: Number.isFinite(plan.monthly_price_in_cents) ? plan.monthly_price_in_cents : null,
    tier: status === 'free' ? 'free' : tier,
    status,
    effectiveAt,
  };
}

module.exports = {
  FREE_PLAN_NAME,
  normalizePlanName,
  planTier,
  featuresForTier,
  normalizeMarketplaceSubscription,
};

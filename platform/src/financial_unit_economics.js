class FinancialUnitEconomicsEngine {
  constructor({ store, eventFabric } = {}) {
    if (!store) throw new Error('FinancialUnitEconomicsEngine requires store');
    Object.assign(this, { store, eventFabric });
  }

  calculate(input = {}) {
    const revenue = n(input.revenue);
    const refunds = n(input.refunds);
    const paymentFees = n(input.paymentFees);
    const infrastructure = n(input.infrastructureCost);
    const aiSpend = n(input.aiSpend);
    const deliveryCost = n(input.deliveryCost);
    const marketingSpend = n(input.marketingSpend);
    const newCustomers = n(input.newCustomers);
    const activeCustomers = n(input.activeCustomers);
    const monthlyChurnRate = n(input.monthlyChurnRate);
    const recurringRevenue = n(input.monthlyRecurringRevenue);
    const netRevenue = revenue - refunds;
    const cogs = paymentFees + infrastructure + aiSpend + deliveryCost;
    const grossProfit = netRevenue - cogs;
    const grossMargin = netRevenue > 0 ? grossProfit / netRevenue : null;
    const cac = newCustomers > 0 ? marketingSpend / newCustomers : null;
    const arpa = activeCustomers > 0 ? recurringRevenue / activeCustomers : null;
    const ltv = arpa != null && monthlyChurnRate > 0 && grossMargin != null ? (arpa * grossMargin) / monthlyChurnRate : null;
    const paybackMonths = cac != null && arpa != null && grossMargin > 0 ? cac / (arpa * grossMargin) : null;
    const arr = recurringRevenue * 12;
    const aiRoi = aiSpend > 0 ? (n(input.aiAttributedGrossProfit) - aiSpend) / aiSpend : null;
    return { revenue, netRevenue, cogs, grossProfit, grossMargin, mrr: recurringRevenue, arr, cac, arpa, ltv, ltvToCac: ltv != null && cac > 0 ? ltv / cac : null, paybackMonths, aiSpend, aiRoi, marketingSpend };
  }

  async snapshot({ periodStart, periodEnd, currency = 'AUD', input, subjectType = 'business', subjectId = 'richo-systems', correlationId }) {
    const metrics = this.calculate(input);
    const record = await this.store.createFinancialSnapshot({ periodStart, periodEnd, currency, subjectType, subjectId, metrics, inputs: input, correlationId });
    await this.#emit('finance.snapshot.created', { snapshotId: record.id, subjectType, subjectId, metrics, correlationId });
    return { ...record, metrics };
  }

  assess(metrics, thresholds = {}) {
    const signals = [];
    check(signals, metrics.grossMargin, thresholds.minimumGrossMargin ?? .6, 'below', 'gross_margin_low');
    check(signals, metrics.ltvToCac, thresholds.minimumLtvToCac ?? 3, 'below', 'ltv_cac_low');
    check(signals, metrics.paybackMonths, thresholds.maximumPaybackMonths ?? 12, 'above', 'payback_too_long');
    check(signals, metrics.aiRoi, thresholds.minimumAiRoi ?? 0, 'below', 'ai_roi_negative');
    return { status: signals.some(s => s.severity === 'critical') ? 'critical' : signals.length ? 'watch' : 'healthy', signals };
  }

  cashRunway({ cashBalance, monthlyOperatingCosts, monthlyGrossProfit = 0 }) {
    const burn = Math.max(0, n(monthlyOperatingCosts) - n(monthlyGrossProfit));
    return { cashBalance: n(cashBalance), monthlyNetBurn: burn, runwayMonths: burn > 0 ? n(cashBalance) / burn : null, cashGenerating: burn === 0 };
  }

  async #emit(type, payload) { if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.financial-unit-economics', payload }); }
}

function check(signals, value, threshold, mode, code) {
  if (value == null || !Number.isFinite(value)) return;
  const breached = mode === 'below' ? value < threshold : value > threshold;
  if (breached) signals.push({ code, value, threshold, severity: code === 'gross_margin_low' || code === 'ai_roi_negative' ? 'critical' : 'warning' });
}
function n(v) { const x = Number(v || 0); return Number.isFinite(x) ? x : 0; }

module.exports = { FinancialUnitEconomicsEngine };

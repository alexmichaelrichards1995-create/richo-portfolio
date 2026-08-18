class ExecutiveIntelligence {
  constructor({ store, outcomeIntelligence, incidentCommand, knowledgeGraph, eventFabric } = {}) {
    if (!store) throw new Error('ExecutiveIntelligence requires store');
    Object.assign(this, { store, outcomeIntelligence, incidentCommand, knowledgeGraph, eventFabric });
  }

  async buildScorecard({ windowDays = 30 } = {}) {
    const [revenue, memberships, products, conversion, incidents, aiSpend, customers, readiness] = await Promise.all([
      this.store.getRevenueSummary?.({ windowDays }) || {},
      this.store.getMembershipSummary?.({ windowDays }) || {},
      this.store.getProductSummary?.({ windowDays }) || {},
      this.store.getConversionSummary?.({ windowDays }) || {},
      this.store.getIncidentSummary?.({ windowDays }) || {},
      this.store.getAISpendSummary?.({ windowDays }) || {},
      this.store.getCustomerHealthSummary?.({ windowDays }) || {},
      this.store.getProductReadinessSummary?.({ windowDays }) || {}
    ]);
    const health = scoreHealth({ revenue, memberships, conversion, incidents, aiSpend, customers, readiness });
    return { windowDays, revenue, memberships, products, conversion, incidents, aiSpend, customers, readiness, health, generatedAt: new Date().toISOString() };
  }

  async forecast({ horizonDays = 30 } = {}) {
    const history = await this.store.getExecutiveHistory?.({ horizonDays: Math.max(90, horizonDays * 3) }) || [];
    const revenueSeries = history.map(x => Number(x.revenue || 0));
    const memberSeries = history.map(x => Number(x.activeMemberships || 0));
    return {
      horizonDays,
      revenue: linearForecast(revenueSeries, horizonDays),
      memberships: linearForecast(memberSeries, horizonDays),
      generatedAt: new Date().toISOString()
    };
  }

  async recommend({ scorecard, forecast } = {}) {
    const sc = scorecard || await this.buildScorecard();
    const fc = forecast || await this.forecast();
    const risks = [];
    const opportunities = [];
    if ((sc.incidents?.criticalOpen || 0) > 0) risks.push({ severity: 'critical', key: 'critical_incidents', message: 'Critical incidents require attention' });
    if ((sc.conversion?.rate || 0) < (sc.conversion?.target || 0)) opportunities.push({ priority: 'high', key: 'conversion_gap', message: 'Conversion is below target', suggestedAction: 'Run commerce conversion improvement experiment' });
    if ((sc.memberships?.churnRate || 0) > (sc.memberships?.targetChurnRate || 1)) risks.push({ severity: 'high', key: 'membership_churn', message: 'Membership churn is above target' });
    if ((sc.aiSpend?.budgetUtilization || 0) > 0.85) risks.push({ severity: 'medium', key: 'ai_budget', message: 'AI spend is approaching budget ceiling' });
    if ((fc.revenue?.trend || 0) > 0) opportunities.push({ priority: 'medium', key: 'revenue_momentum', message: 'Revenue trend is positive', suggestedAction: 'Scale validated acquisition and upsell experiments' });
    return { risks, opportunities, generatedAt: new Date().toISOString() };
  }

  async createOwnerDecision({ title, category, recommendation, evidence = {}, risk = 'medium', deadlineAt = null }) {
    const decision = await this.store.createOwnerDecision({ title, category, recommendation, evidence, risk, deadlineAt, status: 'pending' });
    if (this.eventFabric?.publish) await this.eventFabric.publish({ type: 'executive.owner_decision.created', source: 'richo.executive-intelligence', payload: decision });
    return decision;
  }
}

function scoreHealth({ revenue = {}, memberships = {}, conversion = {}, incidents = {}, aiSpend = {}, customers = {}, readiness = {} }) {
  let score = 100;
  if ((incidents.criticalOpen || 0) > 0) score -= 25;
  if ((memberships.churnRate || 0) > (memberships.targetChurnRate || 1)) score -= 15;
  if ((conversion.rate || 0) < (conversion.target || 0)) score -= 15;
  if ((aiSpend.budgetUtilization || 0) > .9) score -= 10;
  if ((customers.atRiskPercent || 0) > 20) score -= 10;
  if ((readiness.averageScore || 100) < 80) score -= 10;
  if ((revenue.growthRate || 0) < 0) score -= 15;
  return { score: Math.max(0, score), state: score >= 85 ? 'strong' : score >= 70 ? 'watch' : score >= 50 ? 'at_risk' : 'critical' };
}

function linearForecast(values, horizon) {
  if (!values.length) return { projected: null, trend: 0, confidence: 0 };
  if (values.length === 1) return { projected: values[0], trend: 0, confidence: .2 };
  const n = values.length;
  const xs = values.map((_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a,b) => a + b, 0) / n;
  const num = xs.reduce((s,x,i) => s + (x-meanX) * (values[i]-meanY), 0);
  const den = xs.reduce((s,x) => s + (x-meanX) ** 2, 0) || 1;
  const slope = num / den;
  return { projected: Math.max(0, meanY + slope * (n - 1 + horizon)), trend: slope, confidence: Math.min(.9, .35 + n / 200) };
}

module.exports = { ExecutiveIntelligence, scoreHealth, linearForecast };

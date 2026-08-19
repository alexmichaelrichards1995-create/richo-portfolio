const assert = require('assert');
const { ExecutiveIntelligence, scoreHealth, linearForecast } = require('../src/executive_intelligence');

(async () => {
  const decisions = [];
  const store = {
    async getRevenueSummary() { return { growthRate: 8, total: 12000 }; },
    async getMembershipSummary() { return { churnRate: 2, targetChurnRate: 3, active: 40 }; },
    async getProductSummary() { return { active: 8 }; },
    async getConversionSummary() { return { rate: 2.5, target: 3 }; },
    async getIncidentSummary() { return { criticalOpen: 0, open: 2 }; },
    async getAISpendSummary() { return { budgetUtilization: .55 }; },
    async getCustomerHealthSummary() { return { atRiskPercent: 10 }; },
    async getProductReadinessSummary() { return { averageScore: 92 }; },
    async getExecutiveHistory() { return [{ revenue: 100, activeMemberships: 10 }, { revenue: 120, activeMemberships: 12 }, { revenue: 150, activeMemberships: 15 }]; },
    async createOwnerDecision(x) { const d = { id: 'd1', ...x }; decisions.push(d); return d; }
  };
  const executive = new ExecutiveIntelligence({ store });
  const scorecard = await executive.buildScorecard({ windowDays: 30 });
  assert.ok(scorecard.health.score >= 70);
  const forecast = await executive.forecast({ horizonDays: 30 });
  assert.ok(forecast.revenue.trend > 0);
  const recs = await executive.recommend({ scorecard, forecast });
  assert.ok(recs.opportunities.some(x => x.key === 'conversion_gap'));
  const decision = await executive.createOwnerDecision({ title: 'Run conversion experiment', category: 'growth', recommendation: 'Approve controlled CTA test' });
  assert.equal(decision.id, 'd1');
  assert.equal(decisions.length, 1);

  const health = scoreHealth({ revenue: { growthRate: -1 }, memberships: { churnRate: 8, targetChurnRate: 3 }, conversion: { rate: 1, target: 3 }, incidents: { criticalOpen: 1 }, aiSpend: { budgetUtilization: .95 }, customers: { atRiskPercent: 25 }, readiness: { averageScore: 70 } });
  assert.ok(health.score < 50);
  assert.ok(linearForecast([1,2,3], 10).trend > 0);

  console.log('executive_intelligence.test.js passed');
})().catch(err => { console.error(err); process.exit(1); });

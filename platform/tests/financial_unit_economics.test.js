const assert = require('assert');
const { FinancialUnitEconomicsEngine } = require('../src/financial_unit_economics');

(async () => {
  let saved = null;
  const engine = new FinancialUnitEconomicsEngine({ store: { async createFinancialSnapshot(x) { saved = x; return { id: 'fin-1', ...x }; } } });
  const metrics = engine.calculate({ revenue: 20000, refunds: 500, paymentFees: 600, infrastructureCost: 500, aiSpend: 900, deliveryCost: 200, marketingSpend: 3000, newCustomers: 30, activeCustomers: 100, monthlyChurnRate: .04, monthlyRecurringRevenue: 12000, aiAttributedGrossProfit: 2500 });
  assert.equal(metrics.netRevenue, 19500);
  assert.equal(metrics.cogs, 2200);
  assert.ok(metrics.grossMargin > .88);
  assert.equal(metrics.cac, 100);
  assert.ok(metrics.ltv > 0);
  assert.ok(metrics.ltvToCac > 3);
  assert.ok(metrics.aiRoi > 0);
  assert.equal(metrics.arr, 144000);

  const assessment = engine.assess(metrics);
  assert.equal(assessment.status, 'healthy');
  const bad = engine.assess({ grossMargin: .2, ltvToCac: 1, paybackMonths: 24, aiRoi: -.5 });
  assert.equal(bad.status, 'critical');
  assert.ok(bad.signals.length >= 4);

  const runway = engine.cashRunway({ cashBalance: 24000, monthlyOperatingCosts: 6000, monthlyGrossProfit: 2000 });
  assert.equal(runway.monthlyNetBurn, 4000);
  assert.equal(runway.runwayMonths, 6);

  const snap = await engine.snapshot({ periodStart: '2026-08-01', periodEnd: '2026-09-01', input: { revenue: 1000 } });
  assert.equal(snap.id, 'fin-1');
  assert.ok(saved.metrics);
  console.log('financial_unit_economics.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

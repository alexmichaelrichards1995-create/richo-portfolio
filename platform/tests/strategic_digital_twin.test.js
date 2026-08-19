const assert = require('assert');
const { StrategicDigitalTwin, runScenario } = require('../src/strategic_digital_twin');

(async () => {
  const baseline = { monthlyRevenue: 10000, members: 100, churnRate: .03, monthlyAiCost: 500, conversionRate: .02 };
  const growth = runScenario({ baseline, scenario: { id: 'growth', monthlyGrowthPct: 5, conversionChangePct: 10, aiCostChangePct: 15, capacityChangePct: 20 }, assumptions: {}, horizonMonths: 6 });
  const outage = runScenario({ baseline, scenario: { id: 'outage', outageHours: 24, capacityChangePct: -10 }, assumptions: {}, horizonMonths: 6 });
  assert.ok(growth.outcomes.finalMonthlyRevenue > baseline.monthlyRevenue);
  assert.ok(growth.score > outage.score);
  assert.ok(outage.risks.includes('availability'));

  let saved = false;
  const store = { async createStrategicSimulation(x) { saved = true; return { id: 'sim-db', ...x }; } };
  const council = { async deliberate(x) { return { ownerDecision: { id: 'decision-1', status: 'pending' }, ...x }; } };
  const twin = new StrategicDigitalTwin({ store, executiveCouncil: council });
  const sim = await twin.simulate({ name: 'Growth options', baseline, horizonMonths: 6, scenarios: [{id:'base'},{id:'growth',monthlyGrowthPct:5,conversionChangePct:10}] });
  assert.equal(saved, true);
  assert.equal(sim.ranked[0].id, 'growth');
  const deliberation = await twin.deliberateSimulation({ simulation: sim, question: 'Which scenario should we choose?' });
  assert.equal(deliberation.ownerDecision.status, 'pending');
  console.log('strategic_digital_twin.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

const crypto = require('crypto');

class StrategicDigitalTwin {
  constructor({ store, executiveCouncil, eventFabric } = {}) {
    if (!store) throw new Error('StrategicDigitalTwin requires store');
    Object.assign(this, { store, executiveCouncil, eventFabric });
  }

  async simulate({ name, baseline, scenarios, assumptions = {}, horizonMonths = 12, context = {} }) {
    validateBaseline(baseline);
    if (!Array.isArray(scenarios) || !scenarios.length) throw new Error('At least one scenario is required');
    const simulationId = crypto.randomUUID();
    const outputs = scenarios.map(s => runScenario({ baseline, scenario: s, assumptions, horizonMonths }));
    const ranked = [...outputs].sort((a,b) => b.score - a.score);
    const record = await this.store.createStrategicSimulation?.({ simulationId, name, baseline, assumptions, horizonMonths, scenarios: outputs, correlationId: context.correlationId });
    await this.#emit('strategy.simulation.completed', { simulationId, name, ranked });
    return { simulationId, name, baseline, assumptions, horizonMonths, scenarios: outputs, ranked, record };
  }

  async deliberateSimulation({ simulation, question, context = {} }) {
    if (!this.executiveCouncil) throw new Error('Executive council not configured');
    return this.executiveCouncil.deliberate({
      question,
      evidence: { simulationId: simulation.simulationId, baseline: simulation.baseline, rankedScenarios: simulation.ranked },
      options: simulation.ranked.map(x => ({ id: x.id, score: x.score, outcomes: x.outcomes, risks: x.risks })),
      context
    });
  }

  async #emit(type, payload) { if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.strategic-digital-twin', payload }); }
}

function runScenario({ baseline, scenario, assumptions, horizonMonths }) {
  const priceChange = Number(scenario.priceChangePct || 0) / 100;
  const conversionChange = Number(scenario.conversionChangePct || 0) / 100;
  const churnChange = Number(scenario.churnChangePct || 0) / 100;
  const aiCostChange = Number(scenario.aiCostChangePct || 0) / 100;
  const outageHours = Number(scenario.outageHours || 0);
  const capacityChange = Number(scenario.capacityChangePct || 0) / 100;
  const baseRevenue = Number(baseline.monthlyRevenue || 0);
  const baseMembers = Number(baseline.members || 0);
  const baseChurn = Number(baseline.churnRate || 0);
  const baseAiCost = Number(baseline.monthlyAiCost || 0);
  const baseConversion = Number(baseline.conversionRate || 0);
  const growth = Number(scenario.monthlyGrowthPct ?? assumptions.monthlyGrowthPct ?? 0) / 100;

  let revenue = baseRevenue;
  let members = baseMembers;
  const monthly = [];
  for (let month = 1; month <= horizonMonths; month++) {
    const effectiveChurn = Math.max(0, baseChurn * (1 + churnChange));
    members = Math.max(0, members * (1 + growth - effectiveChurn));
    revenue = Math.max(0, revenue * (1 + growth + conversionChange) * (1 + priceChange) * (1 - Math.min(outageHours / 720, .5)));
    monthly.push({ month, revenue, members });
  }
  const finalRevenue = monthly.at(-1)?.revenue || revenue;
  const finalMembers = monthly.at(-1)?.members || members;
  const aiCost = baseAiCost * (1 + aiCostChange);
  const conversion = Math.max(0, baseConversion * (1 + conversionChange));
  const risks = [];
  if (priceChange > .15) risks.push('pricing_elasticity');
  if (outageHours > 1) risks.push('availability');
  if (aiCost > baseAiCost * 1.25) risks.push('ai_cost_growth');
  if (capacityChange < 0) risks.push('capacity_reduction');
  const revenueDeltaPct = baseRevenue ? ((finalRevenue - baseRevenue) / baseRevenue) * 100 : 0;
  const score = revenueDeltaPct + (conversion - baseConversion) * 100 + capacityChange * 20 - risks.length * 10;
  return { id: scenario.id || scenario.name, name: scenario.name || scenario.id, inputs: scenario, outcomes: { finalMonthlyRevenue: round(finalRevenue), finalMembers: round(finalMembers), monthlyAiCost: round(aiCost), conversionRate: round(conversion), revenueDeltaPct: round(revenueDeltaPct), capacityChangePct: round(capacityChange * 100) }, risks, monthly, score: round(score) };
}

function validateBaseline(b = {}) {
  for (const key of ['monthlyRevenue','members','churnRate','monthlyAiCost','conversionRate']) if (!Number.isFinite(Number(b[key]))) throw new Error(`Baseline ${key} must be numeric`);
}
function round(n) { return Math.round(n * 10000) / 10000; }

module.exports = { StrategicDigitalTwin, runScenario };

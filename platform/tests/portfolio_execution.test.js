const assert = require('assert');
const { PortfolioExecution } = require('../src/portfolio_execution');

(async () => {
  const calls = { programs:0, milestones:0, work:0, route:0 };
  const store = {
    async createPortfolio(x) { return { id:'p1', ...x }; },
    async createProgram(x) { calls.programs++; return { id:`prog${calls.programs}`, ...x }; },
    async createMilestone(x) { calls.milestones++; return { id:`m${calls.milestones}`, ...x }; },
    async createWorkPackage(x) { calls.work++; return { id:`w${calls.work}`, ...x }; },
    async listUnresolvedDependencies(id) { return id === 'blocked' ? [{id:'dep1'}] : []; },
    async updateWorkPackageStatus() {},
    async recordPortfolioVariance(x) { return { id:'v1', ...x }; },
    async createCorrectiveProposal(x) { return { id:'c1', ...x }; }
  };
  const sectionSupervisor = { async route(x) { calls.route++; return { accepted:true, ...x }; } };
  const digitalTwin = { async simulate() { return { ranked:[{id:'fix-a',score:10,outcomes:{},risks:[]}], simulationId:'s1' }; } };
  const executiveCouncil = { async deliberate() { return { ownerDecision:{id:'d2'} }; } };
  const engine = new PortfolioExecution({ store, sectionSupervisor, digitalTwin, executiveCouncil });

  const portfolio = await engine.createPortfolio({ title:'Growth', objective:'Grow recurring revenue', ownerDecisionId:'d1', programs:[{title:'Commerce',objective:'Improve conversion',milestones:[{title:'Launch'}]}] });
  assert.equal(portfolio.id,'p1'); assert.equal(calls.programs,1); assert.equal(calls.milestones,1);

  const wp = await engine.createWorkPackage({ programId:'prog1', sectionId:'commerce', agentId:'commerce-ai', title:'CTA test', objective:'Improve CTA' });
  const dispatched = await engine.dispatchWorkPackage(wp);
  assert.equal(dispatched.status,'dispatched'); assert.equal(calls.route,1);

  const blocked = await engine.dispatchWorkPackage({ ...wp, id:'blocked' });
  assert.equal(blocked.status,'blocked_dependencies');

  const variance = await engine.evaluateVariance({ portfolioId:'p1', expectedMetrics:{revenue:100,conversion:2}, actualMetrics:{revenue:80,conversion:2.05}, tolerancePct:10 });
  assert.equal(variance.breached.length,1); assert.equal(variance.breached[0].key,'revenue');

  const correction = await engine.proposeCorrection({ portfolioId:'p1', varianceReport:variance, simulationBaseline:{monthlyRevenue:10000,members:100,churnRate:.03,monthlyAiCost:500,conversionRate:.02}, candidateScenarios:[{id:'fix-a'}] });
  assert.equal(correction.status,'awaiting_owner_decision');
  assert.equal(correction.council.ownerDecision.id,'d2');
  console.log('portfolio_execution.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

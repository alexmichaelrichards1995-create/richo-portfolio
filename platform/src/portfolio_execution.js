const crypto = require('crypto');

class PortfolioExecution {
  constructor({ store, sectionSupervisor, outcomeIntelligence, digitalTwin, executiveCouncil, eventFabric } = {}) {
    if (!store || !sectionSupervisor) throw new Error('PortfolioExecution requires store and sectionSupervisor');
    Object.assign(this, { store, sectionSupervisor, outcomeIntelligence, digitalTwin, executiveCouncil, eventFabric });
  }

  async createPortfolio({ title, objective, ownerDecisionId, budget = {}, successMetrics = [], guardrails = {}, programs = [] }) {
    if (!title || !objective || !ownerDecisionId) throw new Error('Portfolio requires title, objective and ownerDecisionId');
    const portfolio = await this.store.createPortfolio({ title, objective, ownerDecisionId, budget, successMetrics, guardrails, status: 'approved' });
    for (const program of programs) await this.addProgram({ portfolioId: portfolio.id, ...program });
    await this.#emit('portfolio.created', { portfolioId: portfolio.id, ownerDecisionId });
    return portfolio;
  }

  async addProgram({ portfolioId, title, objective, budget = {}, milestones = [] }) {
    const program = await this.store.createProgram({ portfolioId, title, objective, budget, status: 'planned' });
    for (const milestone of milestones) await this.store.createMilestone({ programId: program.id, ...milestone, status: 'planned' });
    return program;
  }

  async createWorkPackage({ programId, sectionId, agentId, title, objective, capabilities = [], dependencies = [], budget = {}, dueAt, risk = 'low' }) {
    const workPackage = await this.store.createWorkPackage({ programId, sectionId, agentId, title, objective, capabilities, dependencies, budget, dueAt, risk, status: 'queued' });
    await this.#emit('portfolio.work_package.created', { workPackageId: workPackage.id, programId, sectionId });
    return workPackage;
  }

  async dispatchWorkPackage(workPackage, context = {}) {
    const unresolved = await this.store.listUnresolvedDependencies?.(workPackage.id) || [];
    if (unresolved.length) return { status: 'blocked_dependencies', unresolved };
    const route = await this.sectionSupervisor.route({ type: 'portfolio.work_package.ready', sectionId: workPackage.sectionId, payload: { workPackage }, correlationId: context.correlationId || crypto.randomUUID() });
    await this.store.updateWorkPackageStatus?.(workPackage.id, 'running');
    return { status: 'dispatched', route };
  }

  async evaluateVariance({ portfolioId, actualMetrics, expectedMetrics, tolerancePct = 10, context = {} }) {
    const variances = [];
    for (const [key, expectedRaw] of Object.entries(expectedMetrics || {})) {
      const expected = Number(expectedRaw); const actual = Number(actualMetrics?.[key]);
      if (!Number.isFinite(expected) || !Number.isFinite(actual)) continue;
      const pct = expected === 0 ? null : ((actual - expected) / Math.abs(expected)) * 100;
      const outsideTolerance = pct !== null && Math.abs(pct) > tolerancePct;
      variances.push({ key, expected, actual, variance: actual - expected, variancePct: pct, outsideTolerance });
    }
    const breached = variances.filter(v => v.outsideTolerance);
    const record = await this.store.recordPortfolioVariance?.({ portfolioId, variances, breached, tolerancePct, correlationId: context.correlationId });
    if (breached.length) await this.#emit('portfolio.variance.detected', { portfolioId, breached });
    return { portfolioId, variances, breached, record };
  }

  async proposeCorrection({ portfolioId, varianceReport, simulationBaseline, candidateScenarios, context = {} }) {
    if (!varianceReport.breached?.length) return { status: 'not_required' };
    let simulation = null;
    if (this.digitalTwin) simulation = await this.digitalTwin.simulate({ name: `Corrective scenarios for portfolio ${portfolioId}`, baseline: simulationBaseline, scenarios: candidateScenarios, horizonMonths: context.horizonMonths || 6, context });
    let council = null;
    if (simulation && this.executiveCouncil) council = await this.executiveCouncil.deliberate({ question: `Which corrective action should portfolio ${portfolioId} take?`, evidence: { varianceReport, simulation }, options: simulation.ranked.map(s => ({ id: s.id, score: s.score, outcomes: s.outcomes, risks: s.risks })), context });
    const proposal = await this.store.createCorrectiveProposal?.({ portfolioId, variance: varianceReport, simulation, ownerDecisionId: council?.ownerDecision?.id, status: council ? 'awaiting_owner_decision' : 'proposed' });
    return { status: proposal?.status || 'proposed', simulation, council, proposal };
  }

  async #emit(type, payload) { if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.portfolio-execution', payload }); }
}

module.exports = { PortfolioExecution };

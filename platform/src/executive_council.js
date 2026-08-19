const crypto = require('crypto');

const DEFAULT_COUNCIL = Object.freeze([
  { id: 'finance-ai', perspective: 'finance', focus: ['cashflow','margin','runway','revenue','cost'] },
  { id: 'product-ai', perspective: 'product', focus: ['readiness','quality','roadmap','retention','value'] },
  { id: 'sales-ai', perspective: 'sales', focus: ['pipeline','conversion','pricing','acquisition','expansion'] },
  { id: 'operations-ai', perspective: 'operations', focus: ['reliability','capacity','delivery','automation','incidents'] },
  { id: 'security-ai', perspective: 'security', focus: ['risk','identity','secrets','compliance','blast_radius'] },
  { id: 'customer-ai', perspective: 'customer', focus: ['health','support','churn','experience','trust'] }
]);

class ExecutiveCouncil {
  constructor({ executionEngine, store, policyEngine, eventFabric, council = DEFAULT_COUNCIL } = {}) {
    if (!executionEngine || !store) throw new Error('ExecutiveCouncil requires executionEngine and store');
    Object.assign(this, { executionEngine, store, policyEngine, eventFabric, council });
  }

  async deliberate({ question, evidence = {}, options = [], context = {} }) {
    if (!question) throw new Error('Council question is required');
    const councilRunId = crypto.randomUUID();
    const analyses = [];
    for (const member of this.council) {
      const result = await this.executionEngine.execute({
        sectionId: 'executive', agentId: member.id,
        task: { objective: `Analyse this executive decision from the ${member.perspective} perspective`, question, evidence, options, focus: member.focus, requiredOutput: ['recommendation','confidence','benefits','risks','assumptions','evidenceGaps'] },
        context: { ...context, councilRunId }
      });
      analyses.push(normalizeAnalysis(member, result));
    }
    const disagreement = detectDisagreement(analyses);
    const challenged = await this.#challenge({ question, evidence, options, analyses, disagreement, context, councilRunId });
    const scenarios = scoreScenarios(options, analyses);
    const recommendation = synthesizeRecommendation(scenarios, challenged, analyses);
    const decision = await this.store.createOwnerDecision({
      source: 'executive_council',
      title: question,
      recommendation: recommendation.summary,
      risk: recommendation.risk,
      evidence: { councilRunId, analyses, disagreement, challenged, scenarios, recommendation },
      status: 'pending'
    });
    await this.#emit('executive.council.recommendation.created', { councilRunId, decisionId: decision.id, recommendation });
    return { councilRunId, analyses, disagreement, challenged, scenarios, recommendation, ownerDecision: decision };
  }

  async #challenge(payload) {
    const critic = await this.executionEngine.execute({ sectionId: 'executive', agentId: 'executive-critic-ai', task: { objective: 'Challenge the council analyses. Find unsupported assumptions, contradictions, hidden downside, missing evidence, and reasons the leading recommendation could fail.', ...payload }, context: { ...payload.context, councilRunId: payload.councilRunId } });
    return { status: critic.status, output: critic.output || critic.result || null, quality: critic.review || null };
  }

  async #emit(type, payload) { if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.executive-council', payload }); }
}

function normalizeAnalysis(member, result = {}) {
  const output = result.output || result.result || {};
  return { memberId: member.id, perspective: member.perspective, status: result.status, recommendation: output.recommendation || output.choice || 'undetermined', confidence: Number(output.confidence ?? result.review?.score ?? 0.5), benefits: output.benefits || [], risks: output.risks || [], assumptions: output.assumptions || [], evidenceGaps: output.evidenceGaps || [], raw: output };
}

function detectDisagreement(analyses) {
  const votes = {};
  for (const a of analyses) votes[a.recommendation] = (votes[a.recommendation] || 0) + 1;
  const ranked = Object.entries(votes).sort((a,b) => b[1]-a[1]);
  return { votes, consensus: ranked.length === 1, leadingRecommendation: ranked[0]?.[0] || null, dissentingRecommendations: ranked.slice(1).map(x => x[0]) };
}

function scoreScenarios(options = [], analyses = []) {
  return options.map(option => {
    const key = option.id || option.name || String(option);
    const supporters = analyses.filter(a => a.recommendation === key);
    const confidence = supporters.length ? supporters.reduce((s,a) => s + a.confidence, 0) / supporters.length : 0;
    const riskCount = analyses.reduce((s,a) => s + a.risks.length, 0);
    return { option: key, support: supporters.length, confidence, riskSignals: riskCount, score: supporters.length * 20 + confidence * 40 - Math.min(riskCount, 20) };
  }).sort((a,b) => b.score-a.score);
}

function synthesizeRecommendation(scenarios, challenged, analyses) {
  const top = scenarios[0] || { option: 'defer', score: 0, confidence: 0 };
  const avgConfidence = analyses.length ? analyses.reduce((s,a)=>s+a.confidence,0)/analyses.length : 0;
  return { option: top.option, summary: `Council recommends ${top.option}; owner decision required before consequential execution.`, score: top.score, confidence: avgConfidence, risk: avgConfidence < 0.6 ? 'high' : 'medium', criticCompleted: challenged.status === 'completed' || challenged.status === 'success' };
}

module.exports = { ExecutiveCouncil, DEFAULT_COUNCIL, detectDisagreement, scoreScenarios };

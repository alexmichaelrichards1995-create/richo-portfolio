const crypto = require('crypto');

const DEFAULT_STAGES = Object.freeze([
  { id: 'research', agentId: 'research-agent', required: true },
  { id: 'architecture', agentId: 'product-architect-agent', required: true },
  { id: 'engineering', agentId: 'product-engineer-agent', required: true },
  { id: 'design', agentId: 'design-agent', required: true },
  { id: 'qa', agentId: 'qa-evidence-agent', required: true },
  { id: 'security', agentId: 'security-agent', required: true },
  { id: 'demo', agentId: 'demo-builder-agent', required: true },
  { id: 'documentation', agentId: 'documentation-agent', required: true },
  { id: 'packaging', agentId: 'commerce-agent', required: true },
  { id: 'release', agentId: 'release-manager-agent', required: true }
]);

class DigitalProductFactory {
  constructor({ store, executionEngine, policyEngine, knowledgeGraph, outcomeIntelligence, eventFabric, stageHandlers = {}, minimumReleaseScore = 90 } = {}) {
    if (!store || !executionEngine || !policyEngine) throw new Error('DigitalProductFactory requires store, executionEngine and policyEngine');
    Object.assign(this, { store, executionEngine, policyEngine, knowledgeGraph, outcomeIntelligence, eventFabric, stageHandlers, minimumReleaseScore });
  }

  async create({ productKey, title, opportunity = {}, targetCustomer = {}, correlationId }) {
    if (!productKey || !title) throw new Error('Product requires productKey and title');
    const run = await this.store.createFactoryRun({ productKey, title, opportunity, targetCustomer, correlationId: correlationId || crypto.randomUUID() });
    await this.#emit('product.factory.created', run);
    return run;
  }

  async runStage({ run, stageId, context = {} }) {
    const stage = DEFAULT_STAGES.find(s => s.id === stageId);
    if (!stage) throw new Error(`Unknown factory stage: ${stageId}`);
    await this.store.updateFactoryRun({ id: run.id, currentStage: stageId, status: statusFor(stageId) });
    const objective = buildObjective(run, stageId);
    const handler = this.stageHandlers[stageId];
    const startedAt = new Date().toISOString();
    try {
      const result = handler
        ? await handler({ run, stage, objective, context })
        : await this.executionEngine.execute({ sectionId: sectionFor(stageId), agentId: stage.agentId, task: { objective, runId: run.id, productKey: run.productKey, stage: stageId }, context: { ...context, correlationId: run.correlationId } });
      const qualityScore = Number(result.review?.score ?? result.qualityScore ?? 100);
      const status = ['completed','success'].includes(result.status) ? 'completed' : result.status;
      const receipt = await this.store.recordFactoryStageReceipt({ factoryRunId: run.id, stage: stageId, agentId: stage.agentId, status, startedAt, completedAt: new Date().toISOString(), qualityScore, result, evidence: result.evidence || {} });
      if (status !== 'completed' || qualityScore < 70) await this.store.updateFactoryRun({ id: run.id, status: 'blocked' });
      await this.#emit(`product.factory.stage.${status}`, receipt);
      return receipt;
    } catch (error) {
      await this.store.recordFactoryStageReceipt({ factoryRunId: run.id, stage: stageId, agentId: stage.agentId, status: 'failed', startedAt, completedAt: new Date().toISOString(), error: { name: error.name, message: error.message } });
      await this.store.updateFactoryRun({ id: run.id, status: 'failed' });
      throw error;
    }
  }

  async assembleReleaseCandidate({ run, version = '1.0.0', context = {} }) {
    const receipts = await this.store.listFactoryStageReceipts({ factoryRunId: run.id });
    const byStage = Object.fromEntries(receipts.map(r => [r.stage, r]));
    const missing = DEFAULT_STAGES.filter(s => s.id !== 'release' && s.required && byStage[s.id]?.status !== 'completed').map(s => s.id);
    const scores = receipts.filter(r => Number.isFinite(Number(r.qualityScore))).map(r => Number(r.qualityScore));
    const readinessScore = scores.length ? scores.reduce((a,b) => a+b, 0) / scores.length : 0;
    const candidate = await this.store.upsertReleaseCandidate({
      factoryRunId: run.id, version, readinessScore,
      qaStatus: byStage.qa?.status || 'pending',
      securityStatus: byStage.security?.status || 'pending',
      demoStatus: byStage.demo?.status || 'pending',
      docsStatus: byStage.documentation?.status || 'pending',
      commerceStatus: byStage.packaging?.status || 'pending',
      approvalStatus: 'pending',
      releaseEvidence: { missingStages: missing, stageReceipts: receipts.map(r => ({ stage: r.stage, status: r.status, qualityScore: r.qualityScore })) }
    });
    if (missing.length || readinessScore < this.minimumReleaseScore) {
      await this.store.updateFactoryRun({ id: run.id, status: 'blocked' });
      return { status: 'blocked', candidate, missing, readinessScore };
    }
    const policy = await this.policyEngine.evaluate({ actor: { type: 'ai_agent', id: 'release-manager-agent' }, capability: 'release:product', operation: 'release:product', environment: context.environment || 'production', risk: 'high', dataClassification: 'internal', context: { factoryRunId: run.id, candidateId: candidate.id } });
    if (policy.decision !== 'allow') {
      await this.store.updateFactoryRun({ id: run.id, status: 'awaiting_release_approval' });
      return { status: policy.decision === 'require_approval' ? 'awaiting_approval' : 'denied', candidate, policy };
    }
    return { status: 'ready_for_release', candidate, policy };
  }

  async release({ run, candidate, publish, context = {} }) {
    if (typeof publish !== 'function') throw new Error('Release requires governed publish function');
    const result = await publish({ run, candidate, context });
    await this.store.updateReleaseCandidate({ id: candidate.id, approvalStatus: 'approved', releaseEvidence: { ...(candidate.releaseEvidence || {}), publishResult: result } });
    await this.store.updateFactoryRun({ id: run.id, status: 'released', currentStage: 'released' });
    await this.#emit('product.factory.released', { runId: run.id, candidateId: candidate.id, result });
    return { status: 'released', result };
  }

  async #emit(type, payload) {
    if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.product-factory', payload });
  }
}

function statusFor(stage) {
  return ({ research:'researching', architecture:'architecting', engineering:'building', design:'designing', qa:'qa', security:'security_review', demo:'packaging', documentation:'packaging', packaging:'packaging', release:'awaiting_release_approval' })[stage] || 'building';
}
function sectionFor(stage) {
  return ({ research:'product', architecture:'product', engineering:'product', design:'product', qa:'quality', security:'security', demo:'product', documentation:'product', packaging:'commerce', release:'operations' })[stage] || 'product';
}
function buildObjective(run, stage) {
  return `Complete the ${stage} stage for R.I.C.H.O. digital product ${run.productKey} — ${run.title}. Opportunity: ${JSON.stringify(run.opportunity || {})}. Target customer: ${JSON.stringify(run.targetCustomer || {})}. Produce evidence-backed artifacts and do not claim completion without verifiable outputs.`;
}

module.exports = { DigitalProductFactory, DEFAULT_STAGES };

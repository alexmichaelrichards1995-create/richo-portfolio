const crypto = require('crypto');

class AutonomousImprovementEngine {
  constructor({ outcomeIntelligence, knowledgeGraph, executionEngine, policyEngine, store, memoryStore, eventFabric, simulator, rollbackManager } = {}) {
    if (!outcomeIntelligence || !knowledgeGraph || !executionEngine || !policyEngine || !store) throw new Error('AutonomousImprovementEngine missing required dependency');
    Object.assign(this, { outcomeIntelligence, knowledgeGraph, executionEngine, policyEngine, store, memoryStore, eventFabric, simulator, rollbackManager });
  }

  async improve({ sectionId, agentId, opportunity, metric, subjectNodeId, proposedChange, context = {} }) {
    const correlationId = context.correlationId || crypto.randomUUID();
    const experiment = await this.outcomeIntelligence.proposeExperiment({
      sectionId, agentId,
      title: opportunity.title,
      hypothesis: opportunity.hypothesis,
      baseline: opportunity.baseline || {},
      expectedOutcome: opportunity.expectedOutcome || {},
      risk: proposedChange.risk || 'low',
      correlationId
    });

    const blastRadius = subjectNodeId ? await this.knowledgeGraph.traceImpact({ nodeId: subjectNodeId, maxDepth: proposedChange.maxImpactDepth || 4 }) : { impacts: [] };
    const simulation = this.simulator ? await this.simulator.run({ proposedChange, blastRadius, context }) : { status: 'not_configured', safe: false };
    const policy = await this.policyEngine.evaluate({
      actor: agentId,
      capability: proposedChange.capability,
      operation: proposedChange.operation,
      environment: context.environment || 'development',
      risk: proposedChange.risk || 'low',
      dataClassification: proposedChange.dataClassification || 'internal',
      context: { experimentId: experiment.id, blastRadius, simulation }
    });

    if (policy.decision === 'deny') return this.#finish('denied', { correlationId, experiment, blastRadius, simulation, policy });
    if (policy.decision === 'require_approval') {
      const approval = await this.store.createApprovalRequest({ sectionId, agentId, correlationId, operation: proposedChange.operation, reason: policy.reason, evidence: { experiment, blastRadius, simulation } });
      return this.#finish('awaiting_approval', { correlationId, experiment, blastRadius, simulation, policy, approval });
    }
    if (!simulation.safe && context.environment === 'production') return this.#finish('simulation_required', { correlationId, experiment, blastRadius, simulation, policy });

    const execution = await this.executionEngine.execute({ sectionId, agentId, task: proposedChange.task, context: { ...context, correlationId, experimentId: experiment.id, blastRadius } });
    if (!['completed', 'success'].includes(execution.status)) return this.#finish('execution_incomplete', { correlationId, experiment, blastRadius, simulation, policy, execution });

    const result = await this.outcomeIntelligence.evaluateExperiment({
      experimentId: experiment.id,
      metricKey: metric.metricKey,
      baselineValue: metric.baselineValue,
      finalValue: metric.finalValue,
      higherIsBetter: metric.direction !== 'lower_is_better',
      confidence: metric.confidence,
      evidence: { executionId: execution.executionId, correlationId }
    });

    let rollback = null;
    if (result.verdict === 'regressed' && this.rollbackManager) rollback = await this.rollbackManager.rollback({ proposedChange, execution, experiment, result, context });
    if (result.verdict === 'improved' && this.memoryStore?.remember) {
      await this.memoryStore.remember({ sectionId, agentId, subjectType: 'improvement_experiment', subjectId: experiment.id, kind: 'validated_improvement', content: { opportunity, proposedChange, result }, importance: 0.9, confidence: result.confidence || 0.8, correlationId });
    }
    return this.#finish(result.verdict, { correlationId, experiment, blastRadius, simulation, policy, execution, result, rollback });
  }

  async #finish(status, payload) {
    if (this.eventFabric?.publish) await this.eventFabric.publish({ type: `improvement.run.${status}`, source: 'richo.autonomous-improvement', payload });
    return { status, ...payload };
  }
}

module.exports = { AutonomousImprovementEngine };

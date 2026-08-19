class ChangeSimulator {
  constructor({ validators = [] } = {}) { this.validators = validators; }
  async run({ proposedChange, blastRadius, context = {} }) {
    const findings = [];
    for (const validator of this.validators) {
      const result = await validator({ proposedChange, blastRadius, context });
      if (result) findings.push(result);
    }
    const blockers = findings.filter(x => x.severity === 'critical' || x.blocking === true);
    return {
      status: blockers.length ? 'blocked' : 'passed',
      safe: blockers.length === 0,
      findings,
      impactedNodes: blastRadius?.impacts?.length || 0,
      simulatedAt: new Date().toISOString()
    };
  }
}

class RollbackManager {
  constructor({ toolRegistry, policyEngine, eventFabric } = {}) { Object.assign(this, { toolRegistry, policyEngine, eventFabric }); }
  async rollback({ proposedChange, execution, experiment, result, context = {} }) {
    if (!proposedChange.rollbackTool) return { status: 'manual_required', reason: 'no_rollback_tool' };
    const policy = await this.policyEngine.evaluate({ actor: context.actor || 'richo.rollback-manager', capability: proposedChange.rollbackCapability || proposedChange.capability, operation: 'rollback', environment: context.environment || 'development', risk: proposedChange.rollbackRisk || 'high', dataClassification: proposedChange.dataClassification || 'internal' });
    if (policy.decision !== 'allow') return { status: policy.decision === 'require_approval' ? 'awaiting_approval' : 'denied', policy };
    const receipt = await this.toolRegistry.invoke(proposedChange.rollbackTool, proposedChange.rollbackArgs || {}, { ...context, experimentId: experiment.id, executionId: execution.executionId });
    if (this.eventFabric?.publish) await this.eventFabric.publish({ type: 'improvement.rollback.executed', source: 'richo.rollback-manager', payload: { experimentId: experiment.id, result, receipt } });
    return { status: 'rolled_back', receipt };
  }
}

module.exports = { ChangeSimulator, RollbackManager };

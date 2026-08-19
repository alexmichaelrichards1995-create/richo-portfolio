const crypto = require('crypto');
const { getSection, listSections } = require('./section_registry');

class SectionSupervisor {
  constructor({ policyEngine, eventFabric, clock = () => new Date() } = {}) {
    this.policyEngine = policyEngine;
    this.eventFabric = eventFabric;
    this.clock = clock;
  }

  describe() {
    return listSections().map(section => ({
      sectionId: section.id,
      agent: section.ownerAgent,
      mode: section.mode,
      triggers: [...section.triggers],
      healthChecks: [...section.healthChecks]
    }));
  }

  async run({ sectionId, trigger, operation, actor = {}, context = {}, execute }) {
    const section = getSection(sectionId);
    if (!section) throw new Error(`Unknown R.I.C.H.O. section: ${sectionId}`);
    if (!section.triggers.includes(trigger)) throw new Error(`Trigger ${trigger} is not registered for ${sectionId}`);
    if (!section.capabilities.includes(operation)) throw new Error(`Operation ${operation} is not allowed for ${section.ownerAgent}`);

    const runId = crypto.randomUUID();
    const startedAt = this.clock().toISOString();
    const approvalByRegistry = section.approvalRequiredFor.includes(operation);

    const policy = this.policyEngine?.evaluate
      ? await this.policyEngine.evaluate({
          actor: { ...actor, agent: section.ownerAgent, section: section.id },
          capability: operation,
          operation,
          environment: context.environment || 'development',
          risk: context.risk || 'low',
          dataClassification: context.dataClassification || 'internal'
        })
      : { decision: approvalByRegistry ? 'require_approval' : 'allow' };

    const decision = approvalByRegistry && policy.decision === 'allow'
      ? 'require_approval'
      : policy.decision;

    const baseEvidence = {
      runId,
      sectionId,
      agent: section.ownerAgent,
      trigger,
      operation,
      startedAt,
      policyDecision: decision,
      context
    };

    await this.#emit('section.run.requested', baseEvidence);

    if (decision === 'deny') {
      await this.#emit('section.run.denied', baseEvidence);
      return { status: 'denied', ...baseEvidence };
    }

    if (decision === 'require_approval') {
      await this.#emit('section.run.awaiting_approval', baseEvidence);
      return { status: 'awaiting_approval', ...baseEvidence };
    }

    if (typeof execute !== 'function') {
      await this.#emit('section.run.planned', baseEvidence);
      return { status: 'planned', ...baseEvidence };
    }

    try {
      const result = await execute({ runId, section, actor, context });
      const completed = {
        ...baseEvidence,
        status: 'completed',
        completedAt: this.clock().toISOString(),
        result
      };
      await this.#emit('section.run.completed', completed);
      return completed;
    } catch (error) {
      const failed = {
        ...baseEvidence,
        status: 'failed',
        failedAt: this.clock().toISOString(),
        error: { name: error.name, message: error.message }
      };
      await this.#emit('section.run.failed', failed);
      throw Object.assign(error, { richoRun: failed });
    }
  }

  async #emit(type, payload) {
    if (!this.eventFabric) return;
    if (typeof this.eventFabric.publish === 'function') {
      await this.eventFabric.publish({ type, source: 'richo.section-supervisor', payload });
    }
  }
}

module.exports = { SectionSupervisor };

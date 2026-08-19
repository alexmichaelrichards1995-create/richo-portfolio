class CustomerSuccessSupportEngine {
  constructor({ store, executionEngine, policyEngine, salesEngine, eventFabric } = {}) {
    if (!store || !executionEngine || !policyEngine) throw new Error('CustomerSuccessSupportEngine missing dependency');
    Object.assign(this, { store, executionEngine, policyEngine, salesEngine, eventFabric });
  }

  scoreHealth(input = {}) {
    const usage = clamp(input.usageScore ?? 0.5);
    const support = clamp(input.supportScore ?? 0.7);
    const payment = clamp(input.paymentScore ?? 1);
    const satisfaction = clamp(input.satisfactionScore ?? 0.7);
    const engagement = clamp(input.engagementScore ?? 0.5);
    const renewal = clamp(input.renewalConfidence ?? 0.7);
    const score = usage*.2 + support*.15 + payment*.15 + satisfaction*.2 + engagement*.15 + renewal*.15;
    const status = score >= .8 ? 'healthy' : score >= .6 ? 'watch' : score >= .4 ? 'at_risk' : 'critical';
    return { score, status, components: { usage, support, payment, satisfaction, engagement, renewal } };
  }

  async onboard({ customerId, productId, membership, entitlements = [], context = {} }) {
    const result = await this.executionEngine.execute({ sectionId: 'support', agentId: 'customer-onboarding-ai', task: { objective: 'Create a concise, accurate onboarding plan using only granted entitlements and product capabilities.', customerId, productId, membership, entitlements, requiredOutput: ['steps','resources','firstSuccessMilestone','supportPath'] }, context });
    const plan = result.output || result.result || {};
    const record = await this.store.createCustomerOnboarding({ customerId, productId, membership, entitlements, plan, status: 'active', correlationId: context.correlationId });
    await this.#emit('customer.onboarding.created', { onboardingId: record.id, customerId, productId });
    return record;
  }

  async triageTicket({ ticket, customerContext = {}, context = {} }) {
    const result = await this.executionEngine.execute({ sectionId: 'support', agentId: 'support-triage-ai', task: { objective: 'Triage this support request using customer entitlements and known system context. Never invent access, refunds, credits, or technical facts.', ticket, customerContext, requiredOutput: ['category','severity','summary','likelyCause','recommendedAction','needsHuman','requiredCapability'] }, context });
    const triage = result.output || result.result || {};
    const record = await this.store.createSupportTicket({ ...ticket, customerId: ticket.customerId, triage, status: triage.needsHuman ? 'escalated' : 'open', correlationId: context.correlationId });
    await this.#emit('support.ticket.triaged', { ticketId: record.id, triage });
    return record;
  }

  async proposeResolution({ ticketId, context = {} }) {
    const ticket = await this.store.getSupportTicket(ticketId);
    const result = await this.executionEngine.execute({ sectionId: 'support', agentId: 'support-resolution-ai', task: { objective: 'Propose a factual resolution. Do not promise refunds, credits, data deletion, account changes, or entitlement changes unless explicitly authorized.', ticket, requiredOutput: ['response','actions','confidence','requiresApproval'] }, context });
    const proposal = result.output || result.result || {};
    if (proposal.requiresApproval) {
      const approval = await this.store.createApprovalRequest({ sectionId: 'support', agentId: 'support-resolution-ai', correlationId: context.correlationId, operation: 'customer_support_resolution', reason: 'Resolution includes consequential customer action', evidence: { ticketId, proposal } });
      return { status: 'awaiting_approval', proposal, approval };
    }
    return { status: 'ready', proposal };
  }

  async assessRenewalRisk({ customerId, membership, healthInputs, context = {} }) {
    const health = this.scoreHealth(healthInputs);
    const result = await this.executionEngine.execute({ sectionId: 'support', agentId: 'retention-risk-ai', task: { objective: 'Assess renewal risk and recommend respectful support actions. Never obstruct cancellation, hide terms, or invent urgency.', customerId, membership, health, requiredOutput: ['risk','drivers','supportActions','educationActions','expansionEligible','confidence'] }, context });
    const assessment = result.output || result.result || {};
    const record = await this.store.upsertCustomerHealth({ customerId, health, renewalRisk: assessment, correlationId: context.correlationId });
    if (this.salesEngine && assessment.expansionEligible === true && health.status === 'healthy') {
      record.expansionRecommendation = await this.salesEngine.recommendRetention({ customerId, membership, health, context });
    }
    return record;
  }

  async recordSatisfaction({ customerId, ticketId, score, comment, context = {} }) {
    const numeric = Math.max(0, Math.min(5, Number(score)));
    const record = await this.store.recordCustomerSatisfaction({ customerId, ticketId, score: numeric, comment, correlationId: context.correlationId });
    await this.#emit('customer.satisfaction.recorded', { customerId, ticketId, score: numeric });
    return record;
  }

  async #emit(type, payload) { if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.customer-success-support', payload }); }
}

function clamp(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }

module.exports = { CustomerSuccessSupportEngine };

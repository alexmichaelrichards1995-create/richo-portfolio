'use strict';

const crypto = require('crypto');

const EVENT_TYPES = Object.freeze({
  PRODUCT_SYNCED: 'product.synced',
  ORDER_CREATED: 'commerce.order.created',
  MEMBERSHIP_CHANGED: 'membership.changed',
  AI_JOB_REQUESTED: 'ai.job.requested',
  AI_JOB_COMPLETED: 'ai.job.completed',
  APPROVAL_REQUIRED: 'approval.required',
  APPROVAL_RECORDED: 'approval.recorded',
  AUTOMATION_FAILED: 'automation.failed'
});

const RISK = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' });

class RichoEventBus {
  constructor({ store, logger = console } = {}) {
    this.store = store;
    this.logger = logger;
    this.handlers = new Map();
  }

  on(type, handler) {
    const list = this.handlers.get(type) || [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => this.handlers.set(type, list.filter(h => h !== handler));
  }

  async publish(type, payload, context = {}) {
    if (!Object.values(EVENT_TYPES).includes(type)) throw new Error(`Unsupported event type: ${type}`);
    const event = {
      id: crypto.randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      correlationId: context.correlationId || crypto.randomUUID(),
      actor: context.actor || { type: 'system', id: 'richo-core' },
      source: context.source || 'richo-core',
      payload
    };

    if (this.store?.appendEvent) await this.store.appendEvent(event);
    this.logger.info?.('[RICHO:event]', type, event.id);
    const results = [];
    for (const handler of this.handlers.get(type) || []) results.push(await handler(event));
    return { event, results };
  }
}

class ApprovalGate {
  constructor({ store, eventBus }) {
    this.store = store;
    this.eventBus = eventBus;
  }

  async requireApproval({ action, risk = RISK.MEDIUM, reason, requestedBy, input, correlationId }) {
    const approval = {
      id: crypto.randomUUID(),
      status: 'pending',
      action,
      risk,
      reason,
      requestedBy,
      input,
      createdAt: new Date().toISOString()
    };
    if (this.store?.createApproval) await this.store.createApproval(approval);
    await this.eventBus.publish(EVENT_TYPES.APPROVAL_REQUIRED, approval, {
      correlationId,
      source: 'approval-gate',
      actor: requestedBy || { type: 'system', id: 'richo-core' }
    });
    return approval;
  }

  async decide({ approvalId, decision, decidedBy, notes }) {
    if (!['approved', 'rejected'].includes(decision)) throw new Error('Decision must be approved or rejected');
    const record = { approvalId, decision, decidedBy, notes, decidedAt: new Date().toISOString() };
    if (this.store?.recordApprovalDecision) await this.store.recordApprovalDecision(record);
    await this.eventBus.publish(EVENT_TYPES.APPROVAL_RECORDED, record, {
      source: 'approval-gate',
      actor: decidedBy
    });
    return record;
  }
}

class AIProviderRegistry {
  constructor() { this.providers = new Map(); }
  register(name, adapter) {
    if (!adapter || typeof adapter.run !== 'function') throw new Error('AI adapter must expose run(job)');
    this.providers.set(name, adapter);
    return this;
  }
  get(name) {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`AI provider not registered: ${name}`);
    return provider;
  }
}

class RichoOrchestrator {
  constructor({ store, logger = console } = {}) {
    this.bus = new RichoEventBus({ store, logger });
    this.approvals = new ApprovalGate({ store, eventBus: this.bus });
    this.ai = new AIProviderRegistry();
    this.store = store;
    this.logger = logger;
  }

  registerAI(name, adapter) { this.ai.register(name, adapter); return this; }

  async syncProduct(product, context = {}) {
    const normalized = {
      externalId: String(product.externalId || product.id),
      source: product.source || 'shopify',
      sku: product.sku || null,
      title: product.title,
      status: product.status || 'active',
      price: product.price ?? null,
      currency: product.currency || 'AUD',
      productType: product.productType || 'digital',
      entitlements: product.entitlements || [],
      metadata: product.metadata || {}
    };
    if (this.store?.upsertProduct) await this.store.upsertProduct(normalized);
    return this.bus.publish(EVENT_TYPES.PRODUCT_SYNCED, normalized, { ...context, source: normalized.source });
  }

  async requestAIJob({ provider, capability, input, risk = RISK.LOW, requiresApproval, actor, correlationId }) {
    const job = {
      id: crypto.randomUUID(), provider, capability, input, risk,
      status: 'requested', createdAt: new Date().toISOString()
    };
    if (this.store?.createAIJob) await this.store.createAIJob(job);
    await this.bus.publish(EVENT_TYPES.AI_JOB_REQUESTED, job, { correlationId, actor, source: 'ai-gateway' });

    const mustApprove = requiresApproval === true || [RISK.HIGH, RISK.CRITICAL].includes(risk);
    if (mustApprove) {
      const approval = await this.approvals.requireApproval({
        action: `ai:${provider}:${capability}`,
        risk,
        reason: 'Human approval is required before this AI job may execute.',
        requestedBy: actor,
        input: { jobId: job.id, provider, capability },
        correlationId
      });
      return { job: { ...job, status: 'awaiting_approval' }, approval };
    }

    return this.executeAIJob(job, { actor, correlationId });
  }

  async executeAIJob(job, context = {}) {
    const adapter = this.ai.get(job.provider);
    try {
      const output = await adapter.run({ id: job.id, capability: job.capability, input: job.input });
      const completed = { ...job, status: 'completed', completedAt: new Date().toISOString(), output };
      if (this.store?.completeAIJob) await this.store.completeAIJob(completed);
      await this.bus.publish(EVENT_TYPES.AI_JOB_COMPLETED, completed, { ...context, source: `ai:${job.provider}` });
      return completed;
    } catch (error) {
      const failure = { jobId: job.id, provider: job.provider, message: error.message, failedAt: new Date().toISOString() };
      if (this.store?.failAIJob) await this.store.failAIJob(failure);
      await this.bus.publish(EVENT_TYPES.AUTOMATION_FAILED, failure, { ...context, source: `ai:${job.provider}` });
      throw error;
    }
  }
}

module.exports = { RichoOrchestrator, RichoEventBus, ApprovalGate, AIProviderRegistry, EVENT_TYPES, RISK };

const crypto = require('crypto');

class AutonomousMarketingGrowthEngine {
  constructor({ store, executionEngine, policyEngine, financialEngine, salesEngine, outcomeIntelligence, eventFabric } = {}) {
    if (!store || !executionEngine || !policyEngine) throw new Error('AutonomousMarketingGrowthEngine missing dependency');
    Object.assign(this, { store, executionEngine, policyEngine, financialEngine, salesEngine, outcomeIntelligence, eventFabric });
  }

  async planCampaign({ brief, audience, channels, budget, productId, context = {} }) {
    const result = await this.executionEngine.execute({
      sectionId: 'marketing', agentId: 'growth-strategy-ai',
      task: { objective: 'Create an evidence-based digital growth campaign plan. Avoid deceptive claims, dark patterns, fake scarcity, or invented testimonials.', brief, audience, channels, budget, productId, requiredOutput: ['campaignName','positioning','channelPlan','contentThemes','experimentPlan','expectedMetrics','risks'] },
      context
    });
    const output = result.output || result.result || {};
    const campaign = await this.store.createMarketingCampaign({ id: crypto.randomUUID(), productId, brief, audience, channels, budget: Number(budget || 0), strategy: output, status: 'draft', correlationId: context.correlationId });
    await this.#emit('marketing.campaign.planned', { campaignId: campaign.id, productId });
    return campaign;
  }

  async generateCreative({ campaignId, format, context = {} }) {
    const campaign = await this.store.getMarketingCampaign(campaignId);
    const result = await this.executionEngine.execute({ sectionId: 'marketing', agentId: 'creative-ai', task: { objective: 'Generate campaign creative grounded in the approved product facts and campaign strategy. Do not invent product capabilities.', campaign, format, requiredOutput: ['headline','body','cta','visualPrompt','claimsUsed'] }, context });
    const creative = result.output || result.result || {};
    return this.store.createMarketingAsset({ campaignId, format, content: creative, status: 'draft', correlationId: context.correlationId });
  }

  async approveSpend({ campaignId, requestedSpend, context = {} }) {
    const policy = await this.policyEngine.evaluate({ actor: 'marketing-ai', capability: 'marketing.spend', operation: 'allocate_campaign_budget', environment: context.environment || 'development', risk: Number(requestedSpend) > 1000 ? 'high' : 'medium', dataClassification: 'internal', context: { campaignId, requestedSpend } });
    if (policy.decision === 'allow') return { status: 'approved', requestedSpend, policy };
    if (policy.decision === 'require_approval') {
      const approval = await this.store.createApprovalRequest({ sectionId: 'marketing', agentId: 'marketing-ai', correlationId: context.correlationId, operation: 'allocate_campaign_budget', reason: policy.reason, evidence: { campaignId, requestedSpend } });
      return { status: 'awaiting_approval', requestedSpend, approval, policy };
    }
    return { status: 'denied', requestedSpend, policy };
  }

  async recordAttribution({ campaignId, channel, spend = 0, visits = 0, leads = 0, customers = 0, revenue = 0, grossProfit = 0, context = {} }) {
    const metrics = calculateGrowthMetrics({ spend, visits, leads, customers, revenue, grossProfit });
    const row = await this.store.recordMarketingAttribution({ campaignId, channel, spend, visits, leads, customers, revenue, grossProfit, metrics, correlationId: context.correlationId });
    if (this.outcomeIntelligence?.observe && Number.isFinite(metrics.cac)) {
      await this.outcomeIntelligence.observe({ metricId: `campaign:${campaignId}:cac`, value: metrics.cac, source: `marketing:${channel}`, correlationId: context.correlationId, evidence: row });
    }
    await this.#emit('marketing.attribution.recorded', { campaignId, channel, metrics });
    return row;
  }

  async optimize({ campaignId, attribution, thresholds = {}, context = {} }) {
    const decision = evaluateOptimization(attribution, thresholds);
    if (decision.action === 'scale') {
      const policy = await this.policyEngine.evaluate({ actor: 'growth-ai', capability: 'marketing.optimize', operation: 'scale_campaign', environment: context.environment || 'development', risk: 'medium', dataClassification: 'internal', context: { campaignId, decision } });
      if (policy.decision !== 'allow') return { status: policy.decision === 'require_approval' ? 'awaiting_approval' : 'denied', decision, policy };
    }
    return { status: 'ready', decision };
  }

  async handoffLead({ lead, context = {} }) {
    if (!this.salesEngine) throw new Error('Sales engine not configured');
    return this.salesEngine.qualify({ lead: { ...lead, source: lead.source || 'marketing' }, context });
  }

  async #emit(type, payload) { if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.autonomous-marketing-growth', payload }); }
}

function calculateGrowthMetrics({ spend = 0, visits = 0, leads = 0, customers = 0, revenue = 0, grossProfit = 0 }) {
  const cvr = visits > 0 ? customers / visits : null;
  const leadRate = visits > 0 ? leads / visits : null;
  const cac = customers > 0 ? spend / customers : null;
  const roas = spend > 0 ? revenue / spend : null;
  const mer = spend > 0 ? grossProfit / spend : null;
  return { conversionRate: cvr, leadRate, cac, roas, grossProfitReturn: mer };
}

function evaluateOptimization(attribution = {}, thresholds = {}) {
  const m = attribution.metrics || attribution;
  const maxCac = thresholds.maxCac ?? Infinity;
  const minRoas = thresholds.minRoas ?? 1;
  const minCustomersForScale = thresholds.minCustomersForScale ?? 3;
  if (m.cac != null && m.cac > maxCac) return { action: 'reduce_or_pause', reason: 'cac_above_limit' };
  if (m.roas != null && m.roas >= minRoas && Number(attribution.customers || 0) >= minCustomersForScale) return { action: 'scale', reason: 'validated_economics' };
  return { action: 'continue_test', reason: 'insufficient_or_mixed_evidence' };
}

module.exports = { AutonomousMarketingGrowthEngine, calculateGrowthMetrics, evaluateOptimization };

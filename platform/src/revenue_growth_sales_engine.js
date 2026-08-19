const crypto = require('crypto');

class RevenueGrowthSalesEngine {
  constructor({ store, executionEngine, policyEngine, financialEngine, eventFabric } = {}) {
    if (!store || !executionEngine || !policyEngine) throw new Error('RevenueGrowthSalesEngine missing dependency');
    Object.assign(this, { store, executionEngine, policyEngine, financialEngine, eventFabric });
  }

  async qualify({ lead, context = {} }) {
    const result = await this.executionEngine.execute({ sectionId: 'sales', agentId: 'sales-qualification-ai', task: { objective: 'Qualify this lead using only supplied evidence. Do not invent budget, authority, need, or timing.', lead, requiredOutput: ['score','fit','needs','evidenceGaps','nextBestAction'] }, context });
    const qualification = normalizeQualification(result);
    const record = await this.store.upsertSalesLead({ ...lead, qualification, correlationId: context.correlationId });
    await this.#emit('sales.lead.qualified', { leadId: record.id, qualification });
    return record;
  }

  async createOpportunity({ leadId, productCandidates = [], context = {} }) {
    const lead = await this.store.getSalesLead(leadId);
    const result = await this.executionEngine.execute({ sectionId: 'sales', agentId: 'sales-opportunity-ai', task: { objective: 'Match this qualified lead to the best suitable R.I.C.H.O. product without deceptive claims or pressure tactics.', lead, productCandidates, requiredOutput: ['recommendedProductId','reason','valueCase','objections','confidence'] }, context });
    const output = result.output || result.result || {};
    return this.store.createSalesOpportunity({ leadId, productId: output.recommendedProductId || null, stage: 'qualified', confidence: Number(output.confidence || 0.5), evidence: output, correlationId: context.correlationId });
  }

  async proposeOffer({ opportunityId, price, discountPct = 0, currency = 'AUD', context = {} }) {
    const opportunity = await this.store.getSalesOpportunity(opportunityId);
    const policy = await this.policyEngine.evaluate({ actor: 'sales-ai', capability: discountPct > 0 ? 'pricing.discount' : 'sales.offer', operation: discountPct > 0 ? 'discount_offer' : 'standard_offer', environment: context.environment || 'development', risk: discountPct > 15 ? 'high' : 'low', dataClassification: 'internal', context: { opportunityId, price, discountPct } });
    const offer = { id: crypto.randomUUID(), opportunityId, productId: opportunity.productId, price: Number(price), discountPct: Number(discountPct), currency, finalPrice: Number(price) * (1 - Number(discountPct) / 100), policy };
    if (policy.decision === 'deny') return { status: 'denied', offer };
    if (policy.decision === 'require_approval') {
      const approval = await this.store.createApprovalRequest({ sectionId: 'sales', agentId: 'sales-ai', correlationId: context.correlationId, operation: 'discount_offer', reason: policy.reason, evidence: offer });
      return { status: 'awaiting_approval', offer, approval };
    }
    const saved = await this.store.createSalesOffer({ ...offer, status: 'approved_for_send', correlationId: context.correlationId });
    return { status: 'ready', offer: saved };
  }

  async recordConversion({ opportunityId, orderId, revenue, grossProfit, context = {} }) {
    const conversion = await this.store.recordSalesConversion({ opportunityId, orderId, revenue, grossProfit, correlationId: context.correlationId });
    await this.#emit('sales.opportunity.converted', conversion);
    return conversion;
  }

  async recommendRetention({ customerId, membership, health, context = {} }) {
    const result = await this.executionEngine.execute({ sectionId: 'sales', agentId: 'retention-ai', task: { objective: 'Recommend a customer-respectful retention or expansion action. Do not obstruct cancellation or misrepresent benefits.', customerId, membership, health, requiredOutput: ['action','reason','productId','confidence','doNotContact'] }, context });
    return result.output || result.result || {};
  }

  async economics({ revenue, grossProfit, marketingSpend, newCustomers, recurringRevenue, activeCustomers, churnRate }) {
    if (!this.financialEngine) return null;
    return this.financialEngine.calculate({ revenue, marketingSpend, newCustomers, monthlyRecurringRevenue: recurringRevenue, activeCustomers, monthlyChurnRate: churnRate, aiAttributedGrossProfit: grossProfit });
  }

  async #emit(type, payload) { if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.revenue-growth-sales', payload }); }
}

function normalizeQualification(result = {}) {
  const x = result.output || result.result || {};
  const score = Math.max(0, Math.min(100, Number(x.score || 0)));
  return { score, fit: x.fit || (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'), needs: x.needs || [], evidenceGaps: x.evidenceGaps || [], nextBestAction: x.nextBestAction || 'review', confidence: Number(x.confidence || result.review?.score || .5) };
}

module.exports = { RevenueGrowthSalesEngine, normalizeQualification };

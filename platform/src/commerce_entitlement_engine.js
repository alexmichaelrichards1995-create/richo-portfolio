class CommerceEntitlementEngine {
  constructor({ store, policyEngine, eventFabric, outcomeIntelligence } = {}) {
    if (!store || !policyEngine) throw new Error('CommerceEntitlementEngine requires store and policyEngine');
    Object.assign(this, { store, policyEngine, eventFabric, outcomeIntelligence });
  }

  async prepareDeployment({ releaseCandidate, packageConfig, actor = 'commerce-agent', environment = 'development' }) {
    if (!releaseCandidate?.id || !packageConfig?.productKey || !packageConfig?.title) throw new Error('Deployment requires release candidate and product package');
    const policy = await this.policyEngine.evaluate({ actor, capability: 'commerce.prepare', operation: 'prepare_product_deployment', environment, risk: packageConfig.risk || 'low', dataClassification: 'internal' });
    if (policy.decision === 'deny') return { status: 'denied', policy };
    if (policy.decision === 'require_approval') return { status: 'awaiting_approval', policy };
    const product = await this.store.upsertCommerceProduct({ ...packageConfig, releaseCandidateId: releaseCandidate.id, status: 'ready_to_sync' });
    await this.#emit('commerce.product.prepared', { product, releaseCandidateId: releaseCandidate.id });
    return { status: 'prepared', product };
  }

  async grantEntitlement({ customerKey, productKey, sourceType, sourceId, access = {}, evidence = {} }) {
    const entitlement = await this.store.upsertEntitlement({ customerKey, productKey, sourceType, sourceId, status: 'active', access, evidence });
    await this.#emit('entitlement.granted', entitlement);
    return entitlement;
  }

  async revokeEntitlement({ customerKey, productKey, sourceType, sourceId, reason, actor = 'commerce-agent', environment = 'production' }) {
    const policy = await this.policyEngine.evaluate({ actor, capability: 'entitlement.revoke', operation: 'revoke_entitlement', environment, risk: 'high', dataClassification: 'customer' });
    if (policy.decision !== 'allow') return { status: policy.decision === 'require_approval' ? 'awaiting_approval' : 'denied', policy };
    const entitlement = await this.store.updateEntitlementStatus({ customerKey, productKey, sourceType, sourceId, status: 'revoked', reason });
    await this.#emit('entitlement.revoked', entitlement);
    return { status: 'revoked', entitlement };
  }

  async projectMembership({ customerKey, membershipKey, contractId, status, tier, renewsAt, expiresAt, attributes = {} }) {
    const membership = await this.store.upsertMembershipProjection({ customerKey, membershipKey, externalContractId: contractId, status, tier, renewsAt, expiresAt, attributes });
    await this.#emit('membership.projected', membership);
    return membership;
  }

  async handleCommerceEvent(event) {
    const recorded = await this.store.recordCommerceEvent(event);
    if (recorded.duplicate) return { status: 'duplicate', event: recorded.event };
    const e = recorded.event;
    if (e.eventType === 'order.paid' && e.customerKey && e.productKey) {
      await this.grantEntitlement({ customerKey: e.customerKey, productKey: e.productKey, sourceType: 'order', sourceId: e.externalEventId, access: e.payload?.access || {}, evidence: { provider: e.provider, eventId: e.externalEventId } });
    }
    if (e.eventType === 'membership.activated') {
      await this.projectMembership({ customerKey: e.customerKey, membershipKey: e.payload.membershipKey, contractId: e.payload.contractId, status: 'active', tier: e.payload.tier, renewsAt: e.payload.renewsAt, expiresAt: e.payload.expiresAt, attributes: e.payload.attributes });
    }
    if (this.outcomeIntelligence && Number.isFinite(e.amountCents)) {
      try { await this.outcomeIntelligence.observe({ metricId: e.payload?.revenueMetricId, value: e.amountCents / 100, source: e.provider, correlationId: e.correlationId, evidence: { commerceEventId: e.id } }); } catch (_) {}
    }
    await this.#emit(`commerce.event.${e.eventType}`, e);
    return { status: 'processed', event: e };
  }

  async #emit(type, payload) {
    if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.commerce-entitlement', payload });
  }
}

module.exports = { CommerceEntitlementEngine };

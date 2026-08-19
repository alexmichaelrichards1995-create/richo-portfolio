class CommerceReconciliationWorker {
  constructor({ store, adapters = {}, policyEngine, eventFabric } = {}) {
    if (!store) throw new Error('CommerceReconciliationWorker requires store');
    this.store = store;
    this.adapters = adapters;
    this.policyEngine = policyEngine;
    this.eventFabric = eventFabric;
  }

  async reconcileProduct({ productId, context = {} }) {
    const canonical = await this.store.getCanonicalProduct(productId);
    const remote = await this.adapters.shopify?.getProduct?.(canonical.shopifyProductId);
    const diffs = diffObjects(pickProduct(canonical), pickProduct(remote));
    return this.#resolve({ resourceType: 'product', resourceId: productId, diffs, canonical, remote, context });
  }

  async reconcileMembership({ customerId, context = {} }) {
    const canonical = await this.store.getMembershipProjection(customerId);
    const remote = await this.adapters.appstle?.getMembership?.(canonical.externalMembershipId);
    const diffs = diffObjects(pickMembership(canonical), pickMembership(remote));
    return this.#resolve({ resourceType: 'membership', resourceId: customerId, diffs, canonical, remote, context });
  }

  async #resolve({ resourceType, resourceId, diffs, canonical, remote, context }) {
    if (!diffs.length) return { status: 'in_sync', resourceType, resourceId, diffs: [] };
    const severity = classifyDrift(resourceType, diffs);
    const record = await this.store.recordReconciliationDiff({ resourceType, resourceId, severity, diffs, canonical, remote });
    await this.#emit('commerce.reconciliation.diff', { resourceType, resourceId, severity, diffs, recordId: record?.id });

    if (severity === 'low' && context.autoRepair !== false) {
      const repair = await this.store.applySafeProjectionRepair?.({ resourceType, resourceId, remote, diffs });
      await this.#emit('commerce.reconciliation.repaired', { resourceType, resourceId, diffs, repair });
      return { status: 'repaired', resourceType, resourceId, severity, diffs, repair };
    }

    const policy = this.policyEngine?.evaluate ? await this.policyEngine.evaluate({
      actor: { type: 'system', id: 'commerce-reconciliation-worker' },
      capability: 'reconcile:commerce',
      operation: `repair:${resourceType}`,
      environment: context.environment || 'production',
      risk: severity === 'critical' ? 'critical' : 'high',
      dataClassification: 'customer'
    }) : { decision: 'require_approval' };

    if (policy.decision === 'allow' && context.allowGovernedRepair) {
      const repair = await this.store.applyGovernedRepair?.({ resourceType, resourceId, canonical, remote, diffs });
      return { status: 'repaired_governed', resourceType, resourceId, severity, diffs, repair, policy };
    }

    const incident = await this.store.openReconciliationIncident?.({ resourceType, resourceId, severity, diffs, policy, recordId: record?.id });
    await this.#emit('commerce.reconciliation.escalated', { resourceType, resourceId, severity, diffs, incident, policy });
    return { status: policy.decision === 'deny' ? 'blocked' : 'awaiting_approval', resourceType, resourceId, severity, diffs, incident, policy };
  }

  async #emit(type, payload) {
    if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.commerce-reconciliation', payload });
  }
}

function diffObjects(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const diffs = [];
  for (const key of keys) {
    if (JSON.stringify(a?.[key]) !== JSON.stringify(b?.[key])) diffs.push({ field: key, canonical: a?.[key], remote: b?.[key] });
  }
  return diffs;
}

function classifyDrift(resourceType, diffs) {
  const critical = new Set(['price','status','active','customerId','productId','entitlementState']);
  if (diffs.some(d => critical.has(d.field))) return resourceType === 'membership' ? 'critical' : 'high';
  return 'low';
}

function pickProduct(x = {}) { return { title: x.title, sku: x.sku, price: x.price, status: x.status }; }
function pickMembership(x = {}) { return { active: x.active, tier: x.tier, renewalAt: x.renewalAt, entitlementState: x.entitlementState }; }

module.exports = { CommerceReconciliationWorker, diffObjects, classifyDrift };

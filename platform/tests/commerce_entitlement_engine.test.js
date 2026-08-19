const assert = require('assert');
const { CommerceEntitlementEngine } = require('../src/commerce_entitlement_engine');

(async () => {
  const entitlements = [];
  const memberships = [];
  const products = [];
  const seen = new Set();
  const store = {
    async upsertCommerceProduct(x) { products.push(x); return x; },
    async upsertEntitlement(x) { entitlements.push(x); return x; },
    async updateEntitlementStatus(x) { return x; },
    async upsertMembershipProjection(x) { memberships.push(x); return x; },
    async recordCommerceEvent(e) {
      if (seen.has(e.externalEventId)) return { duplicate: true, event: e };
      seen.add(e.externalEventId);
      return { duplicate: false, event: { id: e.externalEventId, ...e } };
    }
  };
  const allow = { async evaluate() { return { decision: 'allow' }; } };
  const engine = new CommerceEntitlementEngine({ store, policyEngine: allow });

  const prepared = await engine.prepareDeployment({ releaseCandidate: { id: 'rc1' }, packageConfig: { productKey: 'p1', title: 'RICHO Tool', priceCents: 2900 } });
  assert.equal(prepared.status, 'prepared');
  assert.equal(products.length, 1);

  const paid = await engine.handleCommerceEvent({ provider: 'shopify', eventType: 'order.paid', externalEventId: 'evt1', customerKey: 'c1', productKey: 'p1', amountCents: 2900, payload: {} });
  assert.equal(paid.status, 'processed');
  assert.equal(entitlements.length, 1);

  const duplicate = await engine.handleCommerceEvent({ provider: 'shopify', eventType: 'order.paid', externalEventId: 'evt1', customerKey: 'c1', productKey: 'p1', amountCents: 2900, payload: {} });
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(entitlements.length, 1);

  await engine.handleCommerceEvent({ provider: 'appstle', eventType: 'membership.activated', externalEventId: 'evt2', customerKey: 'c1', payload: { membershipKey: 'pro', contractId: 'm1', tier: 'pro' } });
  assert.equal(memberships.length, 1);

  const guarded = new CommerceEntitlementEngine({ store, policyEngine: { async evaluate() { return { decision: 'require_approval' }; } } });
  const revoke = await guarded.revokeEntitlement({ customerKey: 'c1', productKey: 'p1', sourceType: 'order', sourceId: 'evt1' });
  assert.equal(revoke.status, 'awaiting_approval');

  console.log('commerce_entitlement_engine.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

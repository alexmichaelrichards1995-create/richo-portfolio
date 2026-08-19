const assert = require('assert');
const { ProductBehaviorAnalytics } = require('../src/product_behavior_analytics');

(async () => {
  const store = { async recordProductEvent(x) { return { id:'evt1', ...x }; } };
  const engine = new ProductBehaviorAnalytics({ store });
  const saved = await engine.track({ eventName:'product.viewed', sessionId:'s1', productId:'p1' });
  assert.equal(saved.id,'evt1');

  const events = [
    {customerId:'c1',eventName:'view',occurredAt:'2026-08-01T00:00:00Z'},
    {customerId:'c1',eventName:'trial',occurredAt:'2026-08-01T01:00:00Z'},
    {customerId:'c1',eventName:'purchase',occurredAt:'2026-08-01T02:00:00Z'},
    {customerId:'c2',eventName:'view',occurredAt:'2026-08-01T00:00:00Z'},
    {customerId:'c2',eventName:'trial',occurredAt:'2026-08-01T03:00:00Z'}
  ];
  const funnel = engine.funnel({events,steps:['view','trial','purchase']});
  assert.equal(funnel[0].users,2);
  assert.equal(funnel[1].users,2);
  assert.equal(funnel[2].users,1);
  assert.equal(funnel[2].conversionFromStart,.5);

  const adoption = engine.featureAdoption({events:[{customerId:'c1',eventName:'feature.used'},{customerId:'c2',eventName:'other'}],activeCustomers:4,featureEventNames:['feature.used']});
  assert.equal(adoption.adoptionRate,.25);

  const util = engine.entitlementUtilisation({entitlements:[{id:'e1',status:'active'},{id:'e2',status:'active'}],events:[{entitlementId:'e1'}]});
  assert.equal(util.utilisationRate,.5);

  const churn = engine.churnSignals({recentEvents:[],supportTickets:[{status:'open'},{status:'open'}],paymentFailures:1,daysSinceLastActivity:31,entitlementUtilisationRate:.1});
  assert.equal(churn.risk,'critical');
  assert.ok(churn.score >= 70);

  console.log('product_behavior_analytics.test.js passed');
})().catch(error=>{console.error(error);process.exit(1);});

const assert = require('assert');
const crypto = require('crypto');
const { ShopifyAppstleGateway } = require('../src/shopify_appstle_gateway');
const { CommerceReconciliationWorker } = require('../src/commerce_reconciliation');

(async () => {
  const seen = new Set();
  const published = [];
  const handled = [];
  const store = {
    async hasExternalEvent(source, id) { return seen.has(`${source}:${id}`); },
    async recordExternalEvent({ source, externalId }) { seen.add(`${source}:${externalId}`); },
    async getCanonicalProduct() { return { shopifyProductId: 'p1', title: 'A', sku: 'SKU', price: 10, status: 'active' }; },
    async recordReconciliationDiff(x) { return { id: 'd1', ...x }; },
    async openReconciliationIncident(x) { return { id: 'i1', ...x }; }
  };
  const secret = 'secret';
  const raw = Buffer.from(JSON.stringify({ id: 1 }));
  const hmac = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  const gateway = new ShopifyAppstleGateway({
    eventFabric: { async publish(x) { published.push(x); } },
    commerceEngine: { async handleEvent(x) { handled.push(x); } },
    reconciliationStore: store
  });
  const accepted = await gateway.ingestShopify({ topic: 'orders/paid', shopDomain: 'shop.myshopify.com', webhookId: 'w1', payload: { id: 1 }, rawBody: raw, hmacHeader: hmac, secret });
  assert.equal(accepted.status, 'accepted');
  assert.equal(published[0].type, 'commerce.order.paid');
  const duplicate = await gateway.ingestShopify({ topic: 'orders/paid', shopDomain: 'shop.myshopify.com', webhookId: 'w1', payload: { id: 1 }, rawBody: raw, hmacHeader: hmac, secret });
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(handled.length, 1);

  const worker = new CommerceReconciliationWorker({
    store,
    adapters: { shopify: { async getProduct() { return { title: 'A', sku: 'SKU', price: 12, status: 'active' }; } } },
    policyEngine: { async evaluate() { return { decision: 'require_approval' }; } }
  });
  const result = await worker.reconcileProduct({ productId: 'local1', context: { environment: 'production' } });
  assert.equal(result.status, 'awaiting_approval');
  assert.equal(result.severity, 'high');
  assert.equal(result.incident.id, 'i1');

  console.log('shopify_appstle_gateway.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

const assert = require('assert');
const { CircuitBreaker, SecretProvider, ShopifyAdminAdapter } = require('../src/integration_adapters');
const { IntegrationHealthService } = require('../src/integration_health_service');

(async () => {
  const secrets = new SecretProvider({ getSecret: async name => name === 'SHOPIFY_ADMIN_ACCESS_TOKEN' ? 'secret-token' : null });
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    if (calls === 1) {
      return { ok: false, status: 429, headers: { get: () => '0' }, text: async () => '' };
    }
    assert.equal(options.headers['x-shopify-access-token'], 'secret-token');
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ data: { product: { id: 'gid://shopify/Product/1' } } }) };
  };

  const shopify = new ShopifyAdminAdapter({ shopDomain: 'example.myshopify.com', secretProvider: secrets, fetchImpl, baseDelayMs: 1, maxAttempts: 2 });
  const response = await shopify.getProduct('gid://shopify/Product/1');
  assert.equal(response.status, 200);
  assert.equal(calls, 2);

  let now = 0;
  const breaker = new CircuitBreaker({ failureThreshold: 2, resetMs: 100, clock: () => now });
  breaker.failure();
  assert.equal(breaker.state, 'closed');
  breaker.failure();
  assert.equal(breaker.state, 'open');
  assert.equal(breaker.canExecute(), false);
  now = 101;
  assert.equal(breaker.canExecute(), true);
  assert.equal(breaker.state, 'half_open');
  breaker.success();
  assert.equal(breaker.state, 'closed');

  const healthRows = [];
  const health = new IntegrationHealthService({
    store: { async recordIntegrationHealth(row) { healthRows.push(row); } },
    adapters: { shopify: { breaker: { state: 'closed' }, async healthCheck() {} } }
  });
  const findings = await health.checkAll();
  assert.equal(findings[0].state, 'healthy');
  assert.equal(healthRows.length, 1);

  console.log('integration_adapters.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

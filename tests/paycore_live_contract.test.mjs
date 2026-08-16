const BASE = process.env.PAYCORE_BASE_URL || 'https://richo-paycore-intake-api.vercel.app';

async function getJson(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'user-agent': 'richo-contract-check/1.0' }
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const health = await getJson('/api/health');
assert(health.service === 'richo-paycore', 'health.service mismatch');
assert(health.version === '3.0.0', 'health.version mismatch');
assert(health.paymentMode === 'sandbox', 'health.paymentMode must remain sandbox');
assert(health.codeReady === true, 'health.codeReady must be true');
assert(health.databaseConfigured === true, 'health.databaseConfigured must be true');
assert(health.webhookConfigured === true, 'health.webhookConfigured must be true');
assert(health.paymentLinksConfigured === true, 'health.paymentLinksConfigured must be true');
assert(health.liveMoney === false, 'health.liveMoney must be false');

const ready = await getJson('/api/ready');
assert(ready.status === 'ready', 'ready.status mismatch');
assert(ready.database === 'reachable', 'ready.database must be reachable');
assert(ready.schema === 'paycore-v3', 'ready.schema mismatch');
assert(ready.checkout === 'configured', 'ready.checkout mismatch');
assert(ready.webhook === 'configured', 'ready.webhook mismatch');
assert(ready.paymentMode === 'sandbox', 'ready.paymentMode must remain sandbox');
assert(ready.liveMoney === false, 'ready.liveMoney must be false');
assert(ready.sandboxRevenueExcluded === true, 'sandbox revenue must remain excluded');

const offers = await getJson('/api/offers');
assert(offers.currency === 'AUD', 'offers.currency mismatch');
assert(offers.paymentMode === 'sandbox', 'offers.paymentMode must remain sandbox');

const expected = new Map([
  ['quick-wins-kit', { sku: 'RSP-056', amountMinor: 1900, currency: 'AUD' }],
  ['ai-quick-fix', { sku: 'RICHO-AQF-COURSE', amountMinor: 4900, currency: 'AUD' }],
  ['ai-quick-fix-session', { sku: 'RICHO-AQF-SESSION', amountMinor: 19700, currency: 'AUD' }]
]);

assert(Array.isArray(offers.offers), 'offers.offers must be an array');
for (const [slug, contract] of expected) {
  const offer = offers.offers.find(item => item.slug === slug);
  assert(offer, `missing offer: ${slug}`);
  assert(offer.sku === contract.sku, `${slug} SKU mismatch`);
  assert(offer.amountMinor === contract.amountMinor, `${slug} price mismatch`);
  assert(offer.currency === contract.currency, `${slug} currency mismatch`);
}

console.log(`PayCore live contract PASSED against ${BASE}`);

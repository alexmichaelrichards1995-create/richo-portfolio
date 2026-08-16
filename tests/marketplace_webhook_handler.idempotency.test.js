// Test processMarketplaceEvent idempotency, including concurrent duplicate delivery claims.
// Run with: node tests/marketplace_webhook_handler.idempotency.test.js

(async () => {
  try {
    const { processMarketplaceEvent, clearHandledForTests } = require('../marketplace_webhook_handler');
    await clearHandledForTests();

    const sampleEvent = {
      action: 'purchased',
      marketplace_purchase: {
        account: { login: 'acme', id: 9999, type: 'Organization' },
        plan: { id: 1, name: 'Professional', monthly_price_in_cents: 2900 }
      }
    };

    const deliveryId = 'test-delivery-123';

    const first = await processMarketplaceEvent(sampleEvent, deliveryId);
    if (!first || !first.processed) {
      console.error('FAILED: first processing did not return processed');
      process.exit(1);
    }

    const second = await processMarketplaceEvent(sampleEvent, deliveryId);
    if (!second || !second.skipped) {
      console.error('FAILED: second processing did not return skipped');
      process.exit(1);
    }

    await clearHandledForTests();
    const concurrentDeliveryId = 'test-delivery-concurrent-456';
    const results = await Promise.all([
      processMarketplaceEvent(sampleEvent, concurrentDeliveryId),
      processMarketplaceEvent(sampleEvent, concurrentDeliveryId)
    ]);

    const processed = results.filter((result) => result && result.processed).length;
    const skipped = results.filter((result) => result && result.skipped).length;
    if (processed !== 1 || skipped !== 1) {
      console.error('FAILED: concurrent duplicate delivery was not processed exactly once', results);
      process.exit(1);
    }

    console.log('OK: sequential and concurrent idempotency behavior verified');
    process.exit(0);
  } catch (err) {
    console.error('FAILED', err && err.message);
    process.exit(1);
  }
})();

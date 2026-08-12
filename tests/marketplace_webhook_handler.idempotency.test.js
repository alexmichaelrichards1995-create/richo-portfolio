// Test processMarketplaceEvent idempotency
// Run with: node tests/marketplace_webhook_handler.idempotency.test.js

(async () => {
  try {
    process.env.GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'integration-webhook-secret';
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for idempotency test');
    }

    const { processMarketplaceEvent, clearHandledForTests } = require('../marketplace_webhook_handler');
    await clearHandledForTests();

    const sampleEvent = {
      action: 'purchased',
      marketplace_purchase: {
        account: { login: 'acme', id: 9999, type: 'Organization' },
        plan: { id: 1, name: 'Professional', monthly_price_in_cents: 2900 },
        effective_date: new Date().toISOString(),
      },
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

    console.log('OK: idempotency behavior verified');
    process.exit(0);
  } catch (err) {
    console.error('FAILED', err && err.message);
    process.exit(1);
  }
})();

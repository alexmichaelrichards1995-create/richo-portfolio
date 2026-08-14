'use strict';

const assert = require('assert');
const {
  buildPurchaseEvent,
  deterministicUuid,
  normalizeSucceededIntent,
  syncPayCoreRevenue,
} = require('../paycore_revenue_bridge');

class FakeStore {
  constructor(rows, checkpoints = {}) {
    this.rows = rows;
    this.checkpoints = { ...checkpoints };
    this.marked = [];
  }

  async listSucceeded(limit) {
    return this.rows.slice(0, limit);
  }

  async getCheckpoint(id) {
    return this.checkpoints[id] || null;
  }

  async markSent(id, event) {
    const value = { sent_at: new Date().toISOString(), event_uuid: event.uuid };
    this.checkpoints[id] = value;
    this.marked.push({ id, event });
    return value;
  }
}

async function run() {
  const goodRow = {
    id: 'pi_internal_1',
    sku: 'RICH-001',
    product_name: 'R.I.C.H.O. Improvement Pack',
    amount_minor: '19900',
    currency: 'aud',
    provider: 'stripe',
    succeeded_at: '2026-08-15T00:00:00.000Z',
    encrypted_customer: { should_not: 'leave_paycore' },
  };

  const normalized = normalizeSucceededIntent(goodRow);
  assert.deepStrictEqual(normalized, {
    id: 'pi_internal_1',
    sku: 'RICH-001',
    product: 'R.I.C.H.O. Improvement Pack',
    amountMinor: 19900,
    currency: 'AUD',
    provider: 'stripe',
    succeededAt: '2026-08-15T00:00:00.000Z',
  });

  const event = buildPurchaseEvent(normalized);
  assert.strictEqual(event.event, 'richo_purchase_completed');
  assert.strictEqual(event.distinctId, 'paycore:pi_internal_1');
  assert.strictEqual(event.properties.revenue, 19900);
  assert.strictEqual(event.properties.currency, 'AUD');
  assert.strictEqual(event.properties.$process_person_profile, false);
  assert.ok(!JSON.stringify(event).includes('should_not'));
  assert.strictEqual(event.uuid, deterministicUuid('richo_purchase_completed:pi_internal_1'));

  assert.strictEqual(normalizeSucceededIntent({ ...goodRow, succeeded_at: null }), null);
  assert.strictEqual(normalizeSucceededIntent({ ...goodRow, amount_minor: 0 }), null);
  assert.strictEqual(normalizeSucceededIntent({ ...goodRow, currency: 'AU' }), null);

  const captured = [];
  const store = new FakeStore([
    goodRow,
    { ...goodRow, id: 'pi_internal_2', amount_minor: 4900 },
    { ...goodRow, id: 'pi_invalid', amount_minor: 0 },
  ], {
    pi_internal_2: { sent_at: '2026-08-15T00:01:00.000Z' },
  });

  const first = await syncPayCoreRevenue({
    store,
    capture: async message => { captured.push(message); },
  });
  assert.deepStrictEqual(first, { scanned: 3, sent: 1, skipped: 1, invalid: 1, failed: 0 });
  assert.strictEqual(captured.length, 1);
  assert.strictEqual(store.marked.length, 1);
  assert.strictEqual(store.marked[0].id, 'pi_internal_1');

  const second = await syncPayCoreRevenue({
    store,
    capture: async message => { captured.push(message); },
  });
  assert.deepStrictEqual(second, { scanned: 3, sent: 0, skipped: 2, invalid: 1, failed: 0 });
  assert.strictEqual(captured.length, 1, 'checkpoint must prevent duplicate analytics delivery');

  const retryStore = new FakeStore([goodRow]);
  let attempts = 0;
  const failed = await syncPayCoreRevenue({
    store: retryStore,
    capture: async () => {
      attempts += 1;
      throw new Error('temporary analytics outage');
    },
  });
  assert.deepStrictEqual(failed, { scanned: 1, sent: 0, skipped: 0, invalid: 0, failed: 1 });
  assert.strictEqual(retryStore.marked.length, 0, 'failed analytics must not create sent checkpoint');

  const recovered = await syncPayCoreRevenue({
    store: retryStore,
    capture: async () => { attempts += 1; },
  });
  assert.deepStrictEqual(recovered, { scanned: 1, sent: 1, skipped: 0, invalid: 0, failed: 0 });
  assert.strictEqual(attempts, 2);

  console.log('paycore revenue bridge tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

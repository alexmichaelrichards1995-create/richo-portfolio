import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresWebhookStore } from '../app/services/postgres-webhook-store.server';
import { createProvisioningJobStore } from '../app/services/postgres-provisioning-jobs.server';

function fakeDb() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  return {
    calls,
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      if (sql.includes('RETURNING status')) return { rows: [{ status: 'processing' }], rowCount: 1 };
      if (sql.includes('RETURNING j.id')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
  };
}

test('webhook store uses uniqueness-backed insert', async () => {
  const db = fakeDb();
  const store = createPostgresWebhookStore(db);
  const result = await store.begin('shop.test', 'ORDERS_PAID', 'wh_1');
  assert.equal(result.acquired, true);
  assert.match(db.calls[0].sql, /ON CONFLICT \(shop_domain, webhook_id\) DO NOTHING/);
});

test('job lease uses skip locked for multi-worker safety', async () => {
  const db = fakeDb();
  const store = createProvisioningJobStore(db);
  await store.lease('worker-a');
  assert.match(db.calls[0].sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(db.calls[0].sql, /lease_expires_at/);
});

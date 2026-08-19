import assert from 'node:assert/strict';
import test from 'node:test';
import { backoffSeconds, isDeadLetter, nextJob } from '../app/services/provisioning-queue.server';

test('provisioning retry backoff is bounded', () => {
  assert.equal(backoffSeconds(1), 15);
  assert.equal(backoffSeconds(2), 30);
  assert.equal(backoffSeconds(20), 3600);
});

test('job becomes dead-letter after max attempts', () => {
  const base = {
    id: 'job-1', shop: 'example.myshopify.com', customerId: 'c1', orderId: 'o1', entitlementId: 'e1',
    action: 'grant' as const, attempts: 2, maxAttempts: 3, nextAttemptAt: new Date().toISOString(),
  };
  const failed = nextJob(base, new Error('boom'));
  assert.equal(failed.attempts, 3);
  assert.equal(isDeadLetter(failed), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { accessSnapshot, canAccessResource, hasMembership } from '../app/lib/access-policy.server';
import type { EntitlementRecord } from '../app/lib/entitlements.server';

const now = new Date();
const base: EntitlementRecord = {
  id: 'e1', shop: 'richo.myshopify.com', customerId: 'c1', orderId: 'o1',
  sku: 'RICHO-MEM-PRO', kind: 'membership', resourceKey: 'pro', status: 'active',
  createdAt: now, updatedAt: now,
};

test('pro membership satisfies starter and pro but not operator', () => {
  assert.equal(hasMembership([base], 'starter'), true);
  assert.equal(hasMembership([base], 'pro'), true);
  assert.equal(hasMembership([base], 'operator'), false);
});

test('revoked membership grants no access', () => {
  assert.equal(hasMembership([{ ...base, status: 'revoked' }], 'starter'), false);
});

test('direct product entitlement grants its resource', () => {
  const download: EntitlementRecord = { ...base, id: 'e2', sku: 'RICHO-AI-QA-79', kind: 'download', resourceKey: 'qa-toolkit' };
  assert.equal(canAccessResource([download], 'qa-toolkit'), true);
  assert.deepEqual(accessSnapshot([download]).downloads, ['qa-toolkit']);
});

test('expired entitlement grants no access', () => {
  const expired: EntitlementRecord = { ...base, expiresAt: new Date(Date.now() - 1000) };
  assert.equal(hasMembership([expired], 'starter'), false);
});

'use strict';

const assert = require('assert');
const { EventFabric, createEvent } = require('../src/event_fabric');
const { evaluatePolicy } = require('../src/policy_engine');

class MemoryStore {
  constructor() { this.events = []; this.processed = new Map(); this.dead = []; }
  async append(event) { this.events.push(event); }
  async findByIdempotencyKey(key) { return this.events.find(e => e.idempotencyKey === key); }
  async markProcessed(id, value) { this.processed.set(id, value); }
  async get(id) { return this.events.find(e => e.id === id); }
  async appendDeadLetter(failure) { this.dead.push(failure); }
}

(async () => {
  const e = createEvent({ type: 'product.updated', source: 'shopify', subject: 'p1', payload: { b: 2, a: 1 }, idempotencyKey: 'same' });
  assert.equal(e.type, 'product.updated');
  assert.ok(e.payloadHash);
  assert.ok(e.correlationId);

  const store = new MemoryStore();
  let handled = 0;
  const fabric = new EventFabric({ store });
  fabric.register('product.updated', async event => { handled += 1; return { subject: event.subject }; });

  const first = await fabric.ingest({ type: 'product.updated', source: 'shopify', subject: 'p1', payload: { x: 1 }, idempotencyKey: 'evt-1' });
  const second = await fabric.ingest({ type: 'product.updated', source: 'shopify', subject: 'p1', payload: { x: 1 }, idempotencyKey: 'evt-1' });
  assert.equal(first.status, 'accepted');
  assert.equal(second.status, 'duplicate');
  assert.equal(handled, 1);

  const aiHighRisk = evaluatePolicy({
    actor: { id: 'agent-1', type: 'ai', capabilities: ['product.public_release'] },
    operation: 'product.public_release',
    environment: 'production',
    risk: 'high'
  });
  assert.equal(aiHighRisk.decision, 'require_approval');

  const aiApproved = evaluatePolicy({
    actor: { id: 'agent-1', type: 'ai', capabilities: ['product.public_release'] },
    operation: 'product.public_release',
    environment: 'production',
    risk: 'high',
    approval: { approved: true, approvedBy: 'owner-1', approverType: 'human' }
  });
  assert.equal(aiApproved.decision, 'allow');

  const noPermission = evaluatePolicy({ actor: { id: 'agent-2', type: 'ai', capabilities: [] }, operation: 'financial.commit' });
  assert.equal(noPermission.decision, 'deny');

  console.log('platform event fabric + policy tests passed');
})().catch(error => { console.error(error); process.exit(1); });

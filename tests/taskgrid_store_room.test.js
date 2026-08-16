'use strict';

const assert = require('assert');
const { nextDue } = require('../taskgrid/cadence');
const { TaskEngine, sortDue, requiresApproval } = require('../taskgrid/engine');
const { MemoryStore } = require('../taskgrid/memory_store');

function task(id, priority = 'P2', extra = {}) {
  return {
    TaskID: id,
    Task: id,
    Priority: priority,
    Enabled: true,
    Status: 'Ready',
    TaskType: 'Condition Watch',
    Cadence: 'HOURLY',
    ApprovalRequired: false,
    ...extra
  };
}

(async () => {
  const base = new Date('2026-08-16T10:00:00.000Z');
  assert.strictEqual(nextDue('HOURLY', base).toISOString(), '2026-08-16T11:00:00.000Z');
  assert.strictEqual(nextDue('EVERY 6 HOURS', base).toISOString(), '2026-08-16T16:00:00.000Z');
  assert.strictEqual(nextDue('DAILY 08:00', base).toISOString(), '2026-08-16T22:00:00.000Z');
  assert.throws(() => nextDue('Daily and after connector errors', base), /unsupported_cadence/);

  const sorted = sortDue([task('p3', 'P3'), task('p0', 'P0'), task('p1', 'P1')], base);
  assert.deepStrictEqual(sorted.map(x => x.TaskID), ['p0', 'p1', 'p3']);

  assert.strictEqual(requiresApproval(task('x', 'P0', { TaskType: 'Owner Action' })), true);

  const many = Array.from({ length: 25 }, (_, i) => task(`t${i}`, i === 24 ? 'P0' : 'P2'));
  const store = new MemoryStore(many);
  let calls = 0;
  const engine = new TaskEngine({
    store,
    batchSize: 20,
    timeoutMs: 1000,
    adapters: {
      'Condition Watch': async () => { calls++; return { status: 'No Change', message: 'no change' }; }
    }
  });
  const summary = await engine.cycle(base);
  assert.strictEqual(summary.selected, 20);
  assert.strictEqual(summary.backlog, 5);
  assert.strictEqual(calls, 20);

  const approvalStore = new MemoryStore([task('owner', 'P0', { TaskType: 'Owner Action' })]);
  const approvalEngine = new TaskEngine({ store: approvalStore, adapters: { 'Owner Action': async () => ({ status: 'Succeeded' }) } });
  const approvalSummary = await approvalEngine.cycle(base);
  assert.strictEqual(approvalSummary.approvalWaiting, 1);

  const onceStore = new MemoryStore([task('once', 'P1', { Cadence: 'ONCE 2026-08-16T10:00:00Z' })]);
  const onceEngine = new TaskEngine({
    store: onceStore,
    adapters: { 'Condition Watch': async () => ({ status: 'Succeeded', message: 'approved', selfDisable: true }) }
  });
  await onceEngine.cycle(base);
  const [once] = await onceStore.listTasks();
  assert.strictEqual(once.Enabled, false);

  const leaseStore = new MemoryStore([task('lease')]);
  assert.strictEqual(await leaseStore.acquireLease('lease', 'run-a', new Date(Date.now() + 60000)), true);
  assert.strictEqual(await leaseStore.acquireLease('lease', 'run-b', new Date(Date.now() + 60000)), false);

  console.log('taskgrid_store_room.test.js: PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

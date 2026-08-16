'use strict';

const assert = require('assert');
const { nextDue } = require('../taskgrid/cadence');
const { TaskEngine, sortDue, requiresApproval, isDue } = require('../taskgrid/engine');
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

  assert.strictEqual(isDue(task('once-future', 'P1', { Cadence: 'ONCE 2026-08-16T11:00:00Z' }), base), false);
  assert.strictEqual(isDue(task('once-now', 'P1', { Cadence: 'ONCE 2026-08-16T10:00:00Z' }), base), true);

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
  assert.strictEqual(await leaseStore.acquireLease('lease', 'run-a', new Date(base.getTime() + 60000), base), true);
  assert.strictEqual(await leaseStore.acquireLease('lease', 'run-b', new Date(base.getTime() + 61000), new Date(base.getTime() + 1000)), false);
  assert.strictEqual(await leaseStore.acquireLease('lease', 'run-c', new Date(base.getTime() + 121000), new Date(base.getTime() + 61000)), true);

  const repeatTask = task('repeat');
  const repeatStore = new MemoryStore([repeatTask]);
  const repeatEngine = new TaskEngine({
    store: repeatStore,
    adapters: { 'Condition Watch': async () => ({ status: 'Succeeded', message: 'ok' }) }
  });
  await repeatEngine.runTask(repeatTask, base);
  await repeatEngine.runTask(repeatTask, base);
  assert.strictEqual(repeatStore.runs.size, 2);
  assert.strictEqual(new Set([...repeatStore.runs.keys()]).size, 2);

  class RecordFailureStore extends MemoryStore {
    async recordRun() { throw new Error('record_run_failed'); }
  }
  const failureTask = task('record-failure');
  const failureStore = new RecordFailureStore([failureTask]);
  const failureEngine = new TaskEngine({
    store: failureStore,
    adapters: { 'Condition Watch': async () => ({ status: 'Succeeded' }) }
  });
  const failure = await failureEngine.runTask(failureTask, base);
  assert.strictEqual(failure.status, 'Failed');
  assert.strictEqual(failureStore.leases.size, 0);

  console.log('taskgrid_store_room.test.js: PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

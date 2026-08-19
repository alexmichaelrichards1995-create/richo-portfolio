const assert = require('assert');
const { AgentRuntime, MemoryAgentStore } = require('../src/agent_runtime');

function makeSupervisor({ decision = 'allow', shouldFail = false } = {}) {
  return {
    async run({ sectionId, trigger, operation, execute }) {
      if (decision === 'deny') return { status: 'denied', policyDecision: 'deny', sectionId, trigger, operation };
      if (decision === 'require_approval') return { status: 'awaiting_approval', policyDecision: 'require_approval', sectionId, trigger, operation };
      if (shouldFail) throw new Error('synthetic failure');
      const result = execute ? await execute({ runId: 'run-test', section: { id: sectionId } }) : undefined;
      return { status: execute ? 'completed' : 'planned', policyDecision: 'allow', sectionId, trigger, operation, result };
    }
  };
}

async function testCompletesJob() {
  const store = new MemoryAgentStore();
  const runtime = new AgentRuntime({
    store,
    supervisor: makeSupervisor(),
    executorRegistry: { analyse: async () => ({ ok: true }) },
    clock: () => new Date('2026-08-18T12:00:00.000Z')
  });

  const job = await runtime.enqueue({
    sectionId: 'commerce', agentId: 'commerce-ai', trigger: 'order.created', operation: 'analyse'
  });
  const result = await runtime.runOnce();
  assert.equal(result.status, 'completed');
  assert.equal(store.jobs.find(j => j.id === job.id).status, 'completed');
  assert.equal(store.receipts.length, 1);
  assert.equal(store.agents.get('commerce-ai').status, 'idle');
}

async function testApprovalBlocksExecution() {
  const store = new MemoryAgentStore();
  let executed = false;
  const runtime = new AgentRuntime({
    store,
    supervisor: makeSupervisor({ decision: 'require_approval' }),
    executorRegistry: { publish: async () => { executed = true; } }
  });

  const job = await runtime.enqueue({
    sectionId: 'marketing', agentId: 'growth-ai', trigger: 'campaign.ready', operation: 'publish'
  });
  const result = await runtime.runOnce();
  assert.equal(result.status, 'awaiting_approval');
  assert.equal(executed, false);
  assert.equal(store.jobs.find(j => j.id === job.id).status, 'awaiting_approval');
  assert.equal(store.agents.get('growth-ai').status, 'blocked');
}

async function testRetriesFailure() {
  const store = new MemoryAgentStore();
  let now = new Date('2026-08-18T12:00:00.000Z');
  const runtime = new AgentRuntime({
    store,
    supervisor: makeSupervisor({ shouldFail: true }),
    clock: () => now
  });

  const job = await runtime.enqueue({
    sectionId: 'ops', agentId: 'ops-ai', trigger: 'integration.failed', operation: 'diagnose', maxAttempts: 3
  });
  const result = await runtime.runOnce();
  assert.equal(result.status, 'retrying');
  const row = store.jobs.find(j => j.id === job.id);
  assert.equal(row.status, 'queued');
  assert.equal(row.attempts, 1);
  assert(new Date(row.availableAt) > now);
  assert.equal(store.agents.get('ops-ai').status, 'degraded');
}

async function testReapsExpiredLease() {
  const store = new MemoryAgentStore();
  const now = new Date('2026-08-18T12:00:00.000Z');
  const runtime = new AgentRuntime({ store, supervisor: makeSupervisor(), clock: () => now, leaseMs: 1000 });
  const job = await runtime.enqueue({ sectionId: 'qa', agentId: 'qa-ai', trigger: 'build.completed', operation: 'analyse' });
  const claimed = await store.claim({ workerId: 'dead-worker', leaseMs: 1000, now });
  assert.equal(claimed.id, job.id);
  const count = await store.requeueExpiredLeases({ now: new Date(now.getTime() + 1001) });
  assert.equal(count, 1);
  assert.equal(store.jobs.find(j => j.id === job.id).status, 'queued');
}

async function testIdempotency() {
  const store = new MemoryAgentStore();
  const runtime = new AgentRuntime({ store, supervisor: makeSupervisor() });
  const first = await runtime.enqueue({ sectionId: 'sales', agentId: 'sales-ai', trigger: 'lead.created', operation: 'analyse', idempotencyKey: 'lead-42' });
  const second = await runtime.enqueue({ sectionId: 'sales', agentId: 'sales-ai', trigger: 'lead.created', operation: 'analyse', idempotencyKey: 'lead-42' });
  assert.equal(first.id, second.id);
  assert.equal(store.jobs.length, 1);
}

(async () => {
  await testCompletesJob();
  await testApprovalBlocksExecution();
  await testRetriesFailure();
  await testReapsExpiredLease();
  await testIdempotency();
  console.log('agent_runtime.test.js passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});

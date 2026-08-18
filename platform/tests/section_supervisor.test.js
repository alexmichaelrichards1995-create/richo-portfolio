const assert = require('assert');
const { SectionSupervisor } = require('../src/section_supervisor');

(async () => {
  const events = [];
  const fabric = { publish: async e => events.push(e) };
  const allowPolicy = { evaluate: async () => ({ decision: 'allow' }) };
  const supervisor = new SectionSupervisor({ policyEngine: allowPolicy, eventFabric: fabric });

  const completed = await supervisor.run({
    sectionId: 'quality',
    trigger: 'build.completed',
    operation: 'run:tests',
    execute: async () => ({ passed: true })
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.passed, true);
  assert(events.some(e => e.type === 'section.run.completed'));

  const gated = await supervisor.run({
    sectionId: 'product',
    trigger: 'release.requested',
    operation: 'deploy:production'
  }).catch(error => error);
  assert(gated instanceof Error, 'unregistered capability should be rejected before execution');

  const approvalPolicy = { evaluate: async () => ({ decision: 'require_approval' }) };
  const approvalSupervisor = new SectionSupervisor({ policyEngine: approvalPolicy, eventFabric: fabric });
  const awaiting = await approvalSupervisor.run({
    sectionId: 'sales',
    trigger: 'customer.qualified',
    operation: 'draft:follow-up'
  });
  assert.equal(awaiting.status, 'awaiting_approval');

  console.log('section_supervisor.test.js passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});

const assert = require('assert');
const { DigitalProductFactory } = require('../src/product_factory');

(async () => {
  const receipts = [];
  const store = {
    async createFactoryRun(x) { return { id: 'run1', ...x }; },
    async updateFactoryRun() {},
    async recordFactoryStageReceipt(x) { receipts.push(x); return x; },
    async listFactoryStageReceipts() { return receipts; },
    async upsertReleaseCandidate(x) { return { id: 'rc1', releaseEvidence: x.releaseEvidence, ...x }; },
    async updateReleaseCandidate() {}
  };
  const executionEngine = {
    async execute({ task }) { return { status: 'completed', qualityScore: task.stage === 'qa' ? 96 : 94, evidence: { artifact: `${task.stage}.json` } }; }
  };
  const policyEngine = { async evaluate() { return { decision: 'require_approval', reason: 'production release requires human approval' }; } };
  const factory = new DigitalProductFactory({ store, executionEngine, policyEngine, minimumReleaseScore: 90 });
  const run = await factory.create({ productKey: 'RICHO-DEMO', title: 'Demo Product' });
  for (const stage of ['research','architecture','engineering','design','qa','security','demo','documentation','packaging']) {
    const r = await factory.runStage({ run, stageId: stage });
    assert.equal(r.status, 'completed');
  }
  const candidate = await factory.assembleReleaseCandidate({ run, version: '1.0.0', context: { environment: 'production' } });
  assert.equal(candidate.status, 'awaiting_approval');
  assert.ok(candidate.candidate.readinessScore >= 90);

  const blockedStore = {
    ...store,
    async listFactoryStageReceipts() { return receipts.filter(r => r.stage !== 'security'); }
  };
  const blockedFactory = new DigitalProductFactory({ store: blockedStore, executionEngine, policyEngine, minimumReleaseScore: 90 });
  const blocked = await blockedFactory.assembleReleaseCandidate({ run, version: '1.0.1' });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.missing.includes('security'));

  console.log('product_factory.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

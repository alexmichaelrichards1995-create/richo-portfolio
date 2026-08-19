const assert = require('assert');
const { ExecutiveCouncil, detectDisagreement, scoreScenarios } = require('../src/executive_council');

(async () => {
  let calls = 0;
  const executionEngine = {
    async execute({ agentId }) {
      calls++;
      if (agentId === 'executive-critic-ai') return { status: 'completed', output: { challenge: 'Validate CAC and churn assumptions' } };
      const map = { 'finance-ai':'option-a','product-ai':'option-a','sales-ai':'option-b','operations-ai':'option-a','security-ai':'option-b','customer-ai':'option-a' };
      return { status: 'completed', output: { recommendation: map[agentId], confidence: .8, benefits: ['benefit'], risks: ['risk'], assumptions: [], evidenceGaps: [] } };
    }
  };
  const store = { async createOwnerDecision(x) { return { id: 'decision-1', ...x }; } };
  const council = new ExecutiveCouncil({ executionEngine, store });
  const result = await council.deliberate({ question: 'Which growth option should we pursue?', options: [{id:'option-a'},{id:'option-b'}], evidence: { revenue: 100 } });
  assert.equal(calls, 7);
  assert.equal(result.disagreement.leadingRecommendation, 'option-a');
  assert.equal(result.disagreement.consensus, false);
  assert.equal(result.recommendation.option, 'option-a');
  assert.equal(result.ownerDecision.status, 'pending');
  assert.ok(result.recommendation.summary.includes('owner decision required'));

  const d = detectDisagreement([{recommendation:'a'},{recommendation:'b'},{recommendation:'a'}]);
  assert.equal(d.votes.a, 2);
  const scores = scoreScenarios([{id:'a'},{id:'b'}],[{recommendation:'a',confidence:.9,risks:[]},{recommendation:'b',confidence:.5,risks:[]}]);
  assert.equal(scores[0].option, 'a');
  console.log('executive_council.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

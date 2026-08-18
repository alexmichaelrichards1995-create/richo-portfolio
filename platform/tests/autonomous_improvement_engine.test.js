const assert = require('assert');
const { AutonomousImprovementEngine } = require('../src/autonomous_improvement_engine');
const { ChangeSimulator } = require('../src/change_simulator');

(async () => {
  const memories = [];
  const base = {
    outcomeIntelligence: {
      async proposeExperiment(x) { return { id: 'exp1', ...x }; },
      async evaluateExperiment(x) { return { ...x, verdict: 'improved', deltaPercent: 12, confidence: .91 }; }
    },
    knowledgeGraph: { async traceImpact() { return { impacts: [{ nodeId: 'product1' }] }; } },
    executionEngine: { async execute() { return { status: 'completed', executionId: 'run1' }; } },
    store: { async createApprovalRequest(x) { return { id: 'approval1', ...x }; } },
    memoryStore: { async remember(x) { memories.push(x); return x; } },
    simulator: new ChangeSimulator({ validators: [async () => ({ severity: 'info', message: 'dry run passed' })] })
  };

  const allowed = new AutonomousImprovementEngine({ ...base, policyEngine: { async evaluate() { return { decision: 'allow' }; } } });
  const result = await allowed.improve({ sectionId: 'commerce', agentId: 'commerce-ai', opportunity: { title: 'Improve conversion', hypothesis: 'Clearer CTA improves conversion' }, metric: { metricKey: 'conversion', baselineValue: 2, finalValue: 2.24, direction: 'higher_is_better' }, subjectNodeId: 'store', proposedChange: { capability: 'content.optimize', operation: 'optimize_copy', risk: 'low', task: { objective: 'Improve CTA' } }, context: { environment: 'development' } });
  assert.equal(result.status, 'improved');
  assert.equal(memories.length, 1);

  const guarded = new AutonomousImprovementEngine({ ...base, policyEngine: { async evaluate() { return { decision: 'require_approval', reason: 'production pricing change' }; } } });
  const approval = await guarded.improve({ sectionId: 'commerce', agentId: 'commerce-ai', opportunity: { title: 'Price test', hypothesis: 'New price improves revenue' }, metric: { metricKey: 'revenue', baselineValue: 100, finalValue: 100 }, proposedChange: { capability: 'pricing.write', operation: 'change_price', risk: 'high', task: {} }, context: { environment: 'production' } });
  assert.equal(approval.status, 'awaiting_approval');
  assert.equal(approval.approval.id, 'approval1');

  console.log('autonomous_improvement_engine.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

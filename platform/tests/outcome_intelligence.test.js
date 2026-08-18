const assert = require('assert');
const { OutcomeIntelligence } = require('../src/outcome_intelligence');
const { KnowledgeGraph } = require('../src/knowledge_graph');

(async () => {
  const results = [];
  const store = {
    async recordExperimentResult(x) { results.push(x); return x; },
    async getSectionOutcomeScorecard() { return [{ verdict: 'improved' }, { verdict: 'regressed' }, { verdict: 'improved' }]; },
    async listKnowledgeEdges({ fromNodeId }) {
      if (fromNodeId === 'model') return [{ fromNodeId: 'model', relation: 'used_by', toNodeId: 'agent', confidence: 1 }];
      if (fromNodeId === 'agent') return [{ fromNodeId: 'agent', relation: 'operates', toNodeId: 'product', confidence: .9 }];
      return [];
    }
  };

  const oi = new OutcomeIntelligence({ store });
  const improvement = await oi.evaluateExperiment({ experimentId: 'e1', metricKey: 'conversion_rate', baselineValue: 2, finalValue: 2.4, higherIsBetter: true });
  assert.equal(improvement.verdict, 'improved');
  assert.ok(Math.abs(improvement.deltaPercent - 20) < 0.0001);

  const regression = await oi.evaluateExperiment({ experimentId: 'e2', metricKey: 'latency_ms', baselineValue: 100, finalValue: 120, higherIsBetter: false });
  assert.equal(regression.verdict, 'regressed');

  const scorecard = await oi.buildScorecard({ sectionId: 'commerce' });
  assert.equal(scorecard.counts.improved, 2);
  assert.equal(scorecard.counts.regressed, 1);

  const graph = new KnowledgeGraph({ store });
  const impact = await graph.traceImpact({ nodeId: 'model', maxDepth: 3 });
  assert.equal(impact.impacts.length, 2);
  assert.equal(impact.impacts[1].nodeId, 'product');
  const explanation = await graph.explainRelationship({ fromNodeId: 'model', toNodeId: 'product' });
  assert.equal(explanation.depth, 2);

  console.log('outcome_intelligence.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

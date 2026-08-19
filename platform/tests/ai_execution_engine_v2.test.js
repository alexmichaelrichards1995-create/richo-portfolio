const assert = require('assert');
const { AIExecutionEngineV2 } = require('../src/ai_execution_engine_v2');
const { BudgetGuard } = require('../src/budget_guard');
const { ExecutionReviewer } = require('../src/execution_reviewer');

async function run() {
  const recorded = [];
  const budgetGuard = new BudgetGuard({
    store: {
      async getAgentBudget() { return { dailyBudgetCents: 100, dailySpendCents: 10 }; },
      async recordBudgetUsage(x) { recorded.push(x); }
    }
  });

  const responses = [
    {
      provider: 'openai', model: 'test-model', responseId: 'r1', outputText: '',
      output: [{ type: 'function_call', call_id: 'c1', name: 'read_catalog', arguments: '{"sku":"RICHO-1"}' }],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
    },
    {
      provider: 'openai', model: 'test-model', responseId: 'r2', outputText: 'Catalog checked and healthy.', output: [],
      usage: { input_tokens: 8, output_tokens: 6, total_tokens: 14 }
    }
  ];

  const aiAdapter = { async execute() { return responses.shift(); } };
  const toolRegistry = {
    listForModel() { return [{ type: 'function', name: 'read_catalog', parameters: {}, strict: true }]; },
    async invoke(name, args) {
      assert.equal(name, 'read_catalog');
      assert.equal(args.sku, 'RICHO-1');
      return { status: 'completed', result: { healthy: true } };
    }
  };

  const engine = new AIExecutionEngineV2({ aiAdapter, toolRegistry, budgetGuard, reviewer: new ExecutionReviewer({ minimumScore: 0.7 }) });
  const result = await engine.execute({
    job: { id: 'job-1', agentId: 'commerce-agent', correlationId: 'corr-1' },
    section: { id: 'commerce', name: 'Commerce', capabilities: ['read:products'] },
    objective: 'Verify the catalog',
    estimatedCostCents: 2
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.toolResults.length, 1);
  assert.equal(result.review.passed, true);
  assert.equal(recorded.length, 1);

  const blockedEngine = new AIExecutionEngineV2({
    aiAdapter,
    toolRegistry,
    budgetGuard: new BudgetGuard({ store: { async getAgentBudget() { return { dailyBudgetCents: 5, dailySpendCents: 5 }; } } }),
    reviewer: new ExecutionReviewer()
  });
  const blocked = await blockedEngine.execute({
    job: { id: 'job-2', agentId: 'sales-agent' },
    section: { id: 'sales', name: 'Sales', capabilities: [] },
    objective: 'Analyze pipeline',
    estimatedCostCents: 1
  });
  assert.equal(blocked.status, 'blocked_budget');

  console.log('ai_execution_engine_v2.test.js passed');
}

run().catch(error => { console.error(error); process.exit(1); });

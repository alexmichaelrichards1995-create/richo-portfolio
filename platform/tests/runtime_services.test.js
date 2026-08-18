const assert = require('assert');
const { OpenAIResponsesAdapter } = require('../src/openai_responses_adapter');
const { ToolRegistry } = require('../src/tool_registry');
const { RuntimeScheduler } = require('../src/runtime_scheduler');

(async () => {
  let captured;
  const adapter = new OpenAIResponsesAdapter({
    client: { responses: { create: async request => {
      captured = request;
      return { id: 'resp_test', status: 'completed', model: request.model, output_text: 'ok', output: [], usage: { input_tokens: 5, output_tokens: 1 } };
    } } },
    model: 'gpt-5.6',
    store: false
  });
  const ai = await adapter.execute({ agent: { id: 'qa-evidence-agent' }, input: 'Verify evidence.' });
  assert.equal(ai.responseId, 'resp_test');
  assert.equal(captured.model, 'gpt-5.6');
  assert.equal(captured.store, false);
  assert.ok(captured.instructions.includes('R.I.C.H.O'));

  const tools = new ToolRegistry({ policyEngine: { evaluate: async () => ({ decision: 'allow' }) } });
  tools.register({
    name: 'read_catalog',
    description: 'Read canonical product catalog',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    capability: 'read:products',
    handler: async () => ({ products: 3 })
  });
  const exposed = tools.listForModel({ allowedCapabilities: ['read:products'] });
  assert.equal(exposed.length, 1);
  const toolResult = await tools.invoke('read_catalog', {}, { actor: { id: 'commerce-agent' } });
  assert.equal(toolResult.status, 'completed');
  assert.equal(toolResult.result.products, 3);

  const scheduled = [];
  const fakeRuntime = {
    enqueue: async job => { scheduled.push(job); return job; },
    reapExpiredLeases: async () => 2
  };
  const fakeStore = {
    listDueSchedules: async () => [{
      id: '11111111-1111-1111-1111-111111111111', sectionId: 'operations', agentId: 'operations-agent',
      trigger: 'reconciliation.diff', operation: 'reconcile:state', intervalSeconds: 300,
      nextRunAt: new Date('2026-08-18T10:00:00Z'), payload: {}, context: {}
    }],
    advanceSchedule: async () => {}
  };
  const scheduler = new RuntimeScheduler({ runtime: fakeRuntime, store: fakeStore, clock: () => new Date('2026-08-18T10:01:00Z') });
  const tick = await scheduler.tick();
  assert.equal(tick.enqueued, 1);
  assert.equal(tick.recovered, 2);
  assert.equal(scheduled[0].operation, 'reconcile:state');

  console.log('runtime_services.test.js: ok');
})().catch(error => {
  console.error(error);
  process.exit(1);
});

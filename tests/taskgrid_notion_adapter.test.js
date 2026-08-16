'use strict';

const assert = require('assert');
const { NotionAdapter } = require('../taskgrid/notion_adapter');

function page(id, number, priority) {
  return {
    id,
    properties: {
      'Task ID': { unique_id: { prefix: 'TG', number } },
      Task: { title: [{ plain_text: `Task ${number}` }] },
      Priority: { select: { name: priority } },
      Enabled: { checkbox: true },
      Status: { select: { name: 'Ready' } },
      'Task Type': { select: { name: 'Condition Watch' } },
      Cadence: { rich_text: [{ plain_text: 'HOURLY' }] },
      Source: { select: { name: 'ChatGPT Dispatcher' } },
      'Approval Required': { checkbox: false },
      Instruction: { rich_text: [{ plain_text: 'check status' }] },
      'Next Due': { date: null },
      'Last Run': { date: null },
      'Last Result': { rich_text: [] },
      Owner: { rich_text: [{ plain_text: 'R.I.C.H.O.' }] }
    }
  };
}

(async () => {
  const calls = [];
  const responses = [
    { ok: true, json: async () => ({ results: [page('p1', 1, 'P0')], has_more: true, next_cursor: 'cursor-2' }) },
    { ok: true, json: async () => ({ results: [page('p2', 2, 'P2')], has_more: false, next_cursor: null }) }
  ];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ...responses.shift(), headers: { get: () => null } };
  };

  const adapter = new NotionAdapter({ token: 'test-token', dataSourceId: 'ds-test', fetchImpl });
  const tasks = await adapter.listDispatcherTasks({ pageSize: 1 });
  assert.strictEqual(tasks.length, 2);
  assert.strictEqual(tasks[0].TaskID, 'TG-1');
  assert.strictEqual(tasks[0].Priority, 'P0');
  assert.strictEqual(tasks[1].TaskID, 'TG-2');
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].body.page_size, 1);
  assert.strictEqual(calls[1].body.start_cursor, 'cursor-2');
  assert.strictEqual(calls[0].body.filter.and[0].select.equals, 'ChatGPT Dispatcher');
  assert.strictEqual(calls[0].body.filter.and[1].checkbox.equals, true);

  let patchBody;
  const patchAdapter = new NotionAdapter({
    token: 'test-token', dataSourceId: 'ds-test',
    fetchImpl: async (_url, init) => {
      patchBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({}), headers: { get: () => null } };
    }
  });
  await patchAdapter.updateTaskPage('p1', {
    Status: 'No Change', Enabled: true, LastResult: 'no change',
    LastRun: '2026-08-16T11:00:00.000Z', NextDue: '2026-08-16T12:00:00.000Z'
  });
  assert.strictEqual(patchBody.properties.Status.select.name, 'No Change');
  assert.strictEqual(patchBody.properties.Enabled.checkbox, true);

  console.log('taskgrid_notion_adapter.test.js: PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

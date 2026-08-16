'use strict';

const assert = require('assert');
const { Pool } = require('pg');
const { PostgresStore } = require('../taskgrid/postgres_store');

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const store = new PostgresStore({ pool });

  await pool.query('DELETE FROM taskgrid_dead_letters');
  await pool.query('DELETE FROM taskgrid_runs');
  await pool.query('DELETE FROM taskgrid_leases');
  await pool.query('DELETE FROM taskgrid_tasks');

  await pool.query(`
    INSERT INTO taskgrid_tasks(task_id, task_name, priority, enabled, status, task_type, cadence, source)
    VALUES
      ('tg-p0','urgent','P0',TRUE,'Ready','Condition Watch','HOURLY','ChatGPT Dispatcher'),
      ('tg-p2','normal','P2',TRUE,'Ready','Condition Watch','HOURLY','ChatGPT Dispatcher')
  `);

  const tasks = await store.listTasks();
  assert.deepStrictEqual(tasks.map(t => t.TaskID), ['tg-p0', 'tg-p2']);

  const expires = new Date(Date.now() + 60_000);
  assert.strictEqual(await store.acquireLease('tg-p0', 'run-a', expires), true);
  assert.strictEqual(await store.acquireLease('tg-p0', 'run-b', expires), false);
  await store.releaseLease('tg-p0', 'run-a');
  assert.strictEqual(await store.acquireLease('tg-p0', 'run-b', expires), true);

  const startedAt = new Date().toISOString();
  await store.recordRun({ runId: 'run-b', taskId: 'tg-p0', startedAt, state: 'RUNNING', attempt: 1 });
  await store.completeRun('run-b', { state: 'NO_CHANGE', finishedAt: new Date().toISOString(), result: { status: 'No Change' } });
  await store.updateTask('tg-p0', { Status: 'Ready', LastResult: 'no change', LastRun: startedAt, Attempts: 0 });

  await store.deadLetter({ taskId: 'tg-p2', runId: 'run-dlq', classification: 'TEST', message: 'synthetic terminal failure' });
  const metrics = await store.metrics();
  assert.ok(Number(metrics.enabled) >= 2);
  assert.ok(Number(metrics.due) >= 1);

  const { rows: runRows } = await pool.query("SELECT state, result->>'status' AS status FROM taskgrid_runs WHERE run_id='run-b'");
  assert.strictEqual(runRows[0].state, 'NO_CHANGE');
  assert.strictEqual(runRows[0].status, 'No Change');

  const { rows: dlqRows } = await pool.query("SELECT classification FROM taskgrid_dead_letters WHERE run_id='run-dlq'");
  assert.strictEqual(dlqRows[0].classification, 'TEST');

  await pool.end();
  console.log('taskgrid_postgres.integration.test.js: PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

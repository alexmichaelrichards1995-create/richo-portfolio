'use strict';

const { Pool } = require('pg');

class PostgresStore {
  constructor({ pool, connectionString } = {}) {
    this.pool = pool || new Pool({ connectionString: connectionString || process.env.DATABASE_URL });
  }

  async listTasks() {
    const { rows } = await this.pool.query(`
      SELECT task_id AS "TaskID", task_name AS "Task", priority AS "Priority",
             enabled AS "Enabled", status AS "Status", task_type AS "TaskType",
             cadence AS "Cadence", approval_required AS "ApprovalRequired",
             owner_approved AS "OwnerApproved", instruction AS "Instruction",
             next_due AS "NextDue", last_run AS "LastRun", last_result AS "LastResult",
             attempts AS "Attempts", max_attempts AS "MaxAttempts", source AS "Source"
      FROM taskgrid_tasks
      WHERE enabled = TRUE
      ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
               next_due NULLS FIRST, task_id
    `);
    return rows;
  }

  async acquireLease(taskId, runId, expiresAt) {
    const { rowCount } = await this.pool.query(`
      INSERT INTO taskgrid_leases(task_id, run_id, expires_at)
      VALUES ($1,$2,$3)
      ON CONFLICT (task_id) DO UPDATE
      SET run_id = EXCLUDED.run_id, expires_at = EXCLUDED.expires_at
      WHERE taskgrid_leases.expires_at <= NOW() OR taskgrid_leases.run_id = EXCLUDED.run_id
    `, [taskId, runId, expiresAt]);
    return rowCount === 1;
  }

  async releaseLease(taskId, runId) {
    await this.pool.query('DELETE FROM taskgrid_leases WHERE task_id=$1 AND run_id=$2', [taskId, runId]);
  }

  async recordRun(run) {
    await this.pool.query(`
      INSERT INTO taskgrid_runs(run_id, task_id, started_at, state, attempt, evidence)
      VALUES($1,$2,$3,$4,$5,'{}'::jsonb)
    `, [run.runId, run.taskId, run.startedAt, run.state, run.attempt]);
  }

  async completeRun(runId, patch) {
    await this.pool.query(`
      UPDATE taskgrid_runs
      SET state=$2, finished_at=$3, result=$4::jsonb, evidence=COALESCE($5::jsonb, evidence)
      WHERE run_id=$1
    `, [runId, patch.state, patch.finishedAt || null, JSON.stringify(patch.result || {}), JSON.stringify(patch.evidence || null)]);
  }

  async updateTask(taskId, patch) {
    const map = {
      Status: 'status', LastResult: 'last_result', LastRun: 'last_run', NextDue: 'next_due',
      Enabled: 'enabled', Attempts: 'attempts', OwnerApproved: 'owner_approved'
    };
    const keys = Object.keys(patch).filter(k => map[k]);
    if (!keys.length) return;
    const values = [taskId];
    const sets = keys.map((k, i) => {
      values.push(patch[k]);
      return `${map[k]}=$${i + 2}`;
    });
    await this.pool.query(`UPDATE taskgrid_tasks SET ${sets.join(', ')}, updated_at=NOW() WHERE task_id=$1`, values);
  }

  async deadLetter(entry) {
    await this.pool.query(`
      INSERT INTO taskgrid_dead_letters(task_id, run_id, classification, message, payload)
      VALUES($1,$2,$3,$4,$5::jsonb)
    `, [entry.taskId, entry.runId, entry.classification || 'EXECUTION', entry.message || '', JSON.stringify(entry)]);
  }

  async metrics() {
    const { rows: [r] } = await this.pool.query(`
      SELECT COUNT(*) FILTER (WHERE enabled) AS enabled,
             COUNT(*) FILTER (WHERE enabled AND status='Ready' AND (next_due IS NULL OR next_due<=NOW())) AS due,
             COUNT(*) FILTER (WHERE status='Waiting Approval') AS waiting_approval,
             COUNT(*) FILTER (WHERE status='Failed') AS failed,
             EXTRACT(EPOCH FROM (NOW()-MIN(next_due))) FILTER (WHERE enabled AND status='Ready' AND next_due<=NOW()) AS oldest_due_seconds
      FROM taskgrid_tasks
    `);
    return r;
  }
}

module.exports = { PostgresStore };

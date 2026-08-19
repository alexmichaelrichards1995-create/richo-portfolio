const crypto = require('crypto');

class PostgresAgentStore {
  constructor({ pool }) {
    if (!pool) throw new Error('PostgresAgentStore requires pg Pool');
    this.pool = pool;
  }

  async enqueue(job) {
    const sql = `
      INSERT INTO richo_agent_jobs (
        id, section_id, agent_id, trigger, operation, payload, context,
        priority, max_attempts, idempotency_key, correlation_id, causation_id,
        available_at, status
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13,'queued')
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
      DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
      RETURNING *`;
    const values = [
      job.id || crypto.randomUUID(), job.sectionId, job.agentId, job.trigger,
      job.operation, JSON.stringify(job.payload || {}), JSON.stringify(job.context || {}),
      job.priority ?? 100, job.maxAttempts ?? 5, job.idempotencyKey || null,
      job.correlationId || crypto.randomUUID(), job.causationId || null,
      job.availableAt || new Date().toISOString()
    ];
    const { rows } = await this.pool.query(sql, values);
    return mapJob(rows[0]);
  }

  async claim({ workerId, leaseMs, now }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT * FROM richo_agent_jobs
        WHERE status = 'queued' AND available_at <= $1
        ORDER BY priority ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`, [now]);
      if (!rows[0]) {
        await client.query('COMMIT');
        return null;
      }
      const leaseExpiresAt = new Date(now.getTime() + leaseMs);
      const updated = await client.query(`
        UPDATE richo_agent_jobs
        SET status='running', lease_owner=$2, lease_expires_at=$3,
            started_at=COALESCE(started_at,$1), updated_at=$1
        WHERE id=$4
        RETURNING *`, [now, workerId, leaseExpiresAt, rows[0].id]);
      await client.query('COMMIT');
      return mapJob(updated.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async complete({ jobId, status, result, error, at }) {
    await this.pool.query(`
      UPDATE richo_agent_jobs
      SET status=$2, result=$3::jsonb, error=$4::jsonb, completed_at=$5,
          lease_owner=NULL, lease_expires_at=NULL, updated_at=$5
      WHERE id=$1`, [jobId, status, JSON.stringify(result || null), JSON.stringify(normalizeError(error)), at]);
  }

  async retry({ jobId, attempts, availableAt, error }) {
    await this.pool.query(`
      UPDATE richo_agent_jobs
      SET status='queued', attempts=$2, available_at=$3, error=$4::jsonb,
          lease_owner=NULL, lease_expires_at=NULL, updated_at=NOW()
      WHERE id=$1`, [jobId, attempts, availableAt, JSON.stringify(normalizeError(error))]);
  }

  async markAwaitingApproval({ jobId, result, at }) {
    await this.pool.query(`
      UPDATE richo_agent_jobs
      SET status='awaiting_approval', result=$2::jsonb, lease_owner=NULL,
          lease_expires_at=NULL, updated_at=$3
      WHERE id=$1`, [jobId, JSON.stringify(result || {}), at]);
  }

  async heartbeatAgent({ agentId, sectionId, status, currentJobId, at, error, completed }) {
    const { rows } = await this.pool.query(`
      INSERT INTO richo_agent_state (
        agent_id, section_id, status, current_job_id, last_heartbeat_at,
        last_completed_at, last_error, consecutive_failures
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
      ON CONFLICT (agent_id) DO UPDATE SET
        section_id=EXCLUDED.section_id,
        status=EXCLUDED.status,
        current_job_id=EXCLUDED.current_job_id,
        last_heartbeat_at=EXCLUDED.last_heartbeat_at,
        last_completed_at=CASE WHEN $6::timestamptz IS NOT NULL THEN $6 ELSE richo_agent_state.last_completed_at END,
        last_error=CASE WHEN $7::jsonb IS NOT NULL THEN $7::jsonb ELSE richo_agent_state.last_error END,
        consecutive_failures=CASE
          WHEN $3='failed' THEN richo_agent_state.consecutive_failures + 1
          WHEN $3='idle' THEN 0
          ELSE richo_agent_state.consecutive_failures
        END,
        updated_at=$5
      RETURNING *`, [
        agentId, sectionId, status, currentJobId || null, at,
        completed ? at : null, error ? JSON.stringify(normalizeError(error)) : null,
        status === 'failed' ? 1 : 0
      ]);
    return mapAgent(rows[0]);
  }

  async recordReceipt(receipt) {
    await this.pool.query(`
      INSERT INTO richo_agent_run_receipts (
        id, job_id, section_id, agent_id, run_number, status, policy_decision,
        started_at, completed_at, evidence, error
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)`, [
        receipt.id, receipt.jobId, receipt.sectionId, receipt.agentId, receipt.runNumber,
        receipt.status, receipt.policyDecision || null, receipt.startedAt, receipt.completedAt,
        JSON.stringify(receipt.evidence || {}), JSON.stringify(receipt.error || null)
      ]);
  }

  async recordHealth(finding) {
    await this.pool.query(`
      INSERT INTO richo_agent_health_events (
        id, agent_id, section_id, health_state, check_name, detail, recorded_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`, [
        finding.id, finding.agentId, finding.sectionId, finding.healthState,
        finding.checkName, JSON.stringify({ stale: Boolean(finding.stale), ...(finding.details || {}) }),
        finding.checkedAt
      ]);
  }

  async listAgents() {
    const { rows } = await this.pool.query('SELECT * FROM richo_agent_state ORDER BY section_id, agent_id');
    return rows.map(mapAgent);
  }

  async listJobs({ status, limit = 100 } = {}) {
    const values = [];
    let where = '';
    if (status) { values.push(status); where = `WHERE status=$${values.length}`; }
    values.push(limit);
    const { rows } = await this.pool.query(`SELECT * FROM richo_agent_jobs ${where} ORDER BY created_at DESC LIMIT $${values.length}`, values);
    return rows.map(mapJob);
  }

  async requeueExpiredLeases({ now }) {
    const { rowCount } = await this.pool.query(`
      UPDATE richo_agent_jobs
      SET status='queued', lease_owner=NULL, lease_expires_at=NULL,
          available_at=$1, updated_at=$1
      WHERE status='running' AND lease_expires_at <= $1`, [now]);
    return rowCount;
  }

  async listDueSchedules({ now }) {
    const { rows } = await this.pool.query(`
      SELECT * FROM richo_agent_schedules
      WHERE enabled=TRUE AND next_run_at IS NOT NULL AND next_run_at <= $1
      ORDER BY next_run_at ASC
      FOR UPDATE SKIP LOCKED`, [now]);
    return rows.map(mapSchedule);
  }

  async advanceSchedule({ schedule, now }) {
    if (!schedule.intervalSeconds) {
      await this.pool.query(`UPDATE richo_agent_schedules SET enabled=FALSE,last_run_at=$2,updated_at=$2 WHERE id=$1`, [schedule.id, now]);
      return;
    }
    const nextRunAt = new Date(now.getTime() + schedule.intervalSeconds * 1000);
    await this.pool.query(`
      UPDATE richo_agent_schedules
      SET last_run_at=$2,next_run_at=$3,updated_at=$2
      WHERE id=$1`, [schedule.id, now, nextRunAt]);
  }

  async getRuntimeSummary() {
    const [jobs, agents] = await Promise.all([
      this.pool.query(`SELECT status, COUNT(*)::int AS count FROM richo_agent_jobs GROUP BY status`),
      this.pool.query(`SELECT status, COUNT(*)::int AS count FROM richo_agent_state GROUP BY status`)
    ]);
    return {
      jobs: Object.fromEntries(jobs.rows.map(r => [r.status, r.count])),
      agents: Object.fromEntries(agents.rows.map(r => [r.status, r.count]))
    };
  }
}

function normalizeError(error) {
  if (!error) return null;
  return { name: error.name || 'Error', message: error.message || String(error) };
}

function mapJob(r) {
  if (!r) return null;
  return {
    id: r.id, sectionId: r.section_id, agentId: r.agent_id, trigger: r.trigger,
    operation: r.operation, payload: r.payload || {}, context: r.context || {}, priority: r.priority,
    maxAttempts: r.max_attempts, attempts: r.attempts, idempotencyKey: r.idempotency_key,
    correlationId: r.correlation_id, causationId: r.causation_id, availableAt: r.available_at,
    status: r.status, leaseOwner: r.lease_owner, leaseExpiresAt: r.lease_expires_at,
    createdAt: r.created_at, startedAt: r.started_at, completedAt: r.completed_at,
    result: r.result, error: r.error
  };
}

function mapAgent(r) {
  return {
    agentId: r.agent_id, sectionId: r.section_id, status: r.status,
    currentJobId: r.current_job_id, lastHeartbeatAt: r.last_heartbeat_at,
    lastCompletedAt: r.last_completed_at, lastError: r.last_error,
    consecutiveFailures: r.consecutive_failures
  };
}

function mapSchedule(r) {
  return {
    id: r.id, sectionId: r.section_id, agentId: r.agent_id,
    trigger: r.trigger, operation: r.operation, priority: r.priority,
    maxAttempts: r.max_attempts, intervalSeconds: r.interval_seconds,
    nextRunAt: r.next_run_at, payload: r.payload || {}, context: r.context || {}
  };
}

module.exports = { PostgresAgentStore };

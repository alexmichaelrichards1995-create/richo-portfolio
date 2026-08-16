'use strict';

const crypto = require('crypto');
const { nextDue } = require('./cadence');

const PRIORITY = { P0: 0, P1: 1, P2: 2, P3: 3 };
const FINAL = new Set(['Succeeded', 'No Change', 'Failed', 'Waiting Approval', 'Paused']);

function nowIso(now) { return new Date(now).toISOString(); }
function runId(taskId, now) {
  return crypto.createHash('sha256').update(`${taskId}|${nowIso(now)}`).digest('hex').slice(0, 24);
}

function isDue(task, now) {
  if (!task.Enabled || task.Status !== 'Ready') return false;
  if (!task.NextDue) return true;
  return new Date(task.NextDue).getTime() <= now.getTime();
}

function sortDue(tasks, now) {
  return tasks.filter(t => isDue(t, now)).sort((a, b) => {
    const p = (PRIORITY[a.Priority] ?? 99) - (PRIORITY[b.Priority] ?? 99);
    if (p) return p;
    const ad = a.NextDue ? new Date(a.NextDue).getTime() : 0;
    const bd = b.NextDue ? new Date(b.NextDue).getTime() : 0;
    if (ad !== bd) return ad - bd;
    return String(a.TaskID || a.Task || '').localeCompare(String(b.TaskID || b.Task || ''));
  });
}

function requiresApproval(task) {
  return Boolean(task.ApprovalRequired) || task.TaskType === 'Owner Action';
}

function backoffMs(attempt) {
  const base = 5 * 60 * 1000;
  return Math.min(6 * 60 * 60 * 1000, base * Math.pow(2, Math.max(0, attempt - 1)));
}

async function withTimeout(execution, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('task_timeout'), { classification: 'TIMEOUT' })), timeoutMs);
  });
  try {
    return await Promise.race([execution, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class TaskEngine {
  constructor({ store, adapters = {}, batchSize = 20, leaseMs = 10 * 60 * 1000, timeoutMs = 2 * 60 * 1000, connectorCaps = {} }) {
    if (!store) throw new Error('store_required');
    this.store = store;
    this.adapters = adapters;
    this.batchSize = Math.min(20, Math.max(1, batchSize));
    this.leaseMs = leaseMs;
    this.timeoutMs = timeoutMs;
    this.connectorCaps = connectorCaps;
  }

  async cycle(now = new Date()) {
    const snapshot = await this.store.listTasks();
    const due = sortDue(snapshot, now);
    const selected = due.slice(0, this.batchSize);
    const counts = { due: due.length, selected: selected.length, processed: 0, skipped: 0, failed: 0, approvalWaiting: 0 };

    for (const task of selected) {
      const outcome = await this.runTask(task, now);
      counts.processed++;
      if (outcome.status === 'Failed') counts.failed++;
      if (outcome.status === 'Waiting Approval') counts.approvalWaiting++;
      if (outcome.status === 'Skipped') counts.skipped++;
    }

    return { ...counts, backlog: Math.max(0, due.length - selected.length) };
  }

  async runTask(task, now = new Date()) {
    const id = task.TaskID || task.id || task.Task;
    const rid = runId(id, now);
    const lease = await this.store.acquireLease(id, rid, new Date(now.getTime() + this.leaseMs));
    if (!lease) return { status: 'Skipped', reason: 'lease_not_acquired' };

    const startedAt = nowIso(now);
    await this.store.recordRun({ runId: rid, taskId: id, startedAt, state: 'RUNNING', attempt: (task.Attempts || 0) + 1 });

    try {
      if (requiresApproval(task) && !task.OwnerApproved) {
        const result = { status: 'Waiting Approval', message: 'Owner approval required before consequential action.' };
        await this.finish(task, rid, result, now);
        return result;
      }

      const adapter = this.adapters[task.TaskType];
      if (!adapter) throw Object.assign(new Error('adapter_unavailable'), { classification: 'CONFIGURATION' });

      const execution = Promise.resolve(adapter(task, { runId: rid, now }));
      const result = await withTimeout(execution, this.timeoutMs);
      const normalized = {
        status: FINAL.has(result?.status) ? result.status : 'Succeeded',
        message: String(result?.message || 'completed').slice(0, 4000),
        evidenceRefs: Array.isArray(result?.evidenceRefs) ? result.evidenceRefs.slice(0, 20) : [],
        selfDisable: Boolean(result?.selfDisable)
      };
      await this.finish(task, rid, normalized, now);
      return normalized;
    } catch (err) {
      const attempt = (task.Attempts || 0) + 1;
      const terminal = attempt >= (task.MaxAttempts || 5);
      const next = terminal ? null : new Date(now.getTime() + backoffMs(attempt));
      const result = {
        status: 'Failed',
        message: String(err.message || err).slice(0, 4000),
        classification: err.classification || 'EXECUTION',
        retryAt: next ? next.toISOString() : null,
        deadLetter: terminal
      };
      await this.store.completeRun(rid, { state: 'FAILED', finishedAt: nowIso(new Date()), result });
      await this.store.updateTask(id, {
        Status: terminal ? 'Failed' : 'Ready',
        LastResult: result.message,
        LastRun: startedAt,
        NextDue: result.retryAt,
        Attempts: attempt
      });
      if (terminal && this.store.deadLetter) await this.store.deadLetter({ taskId: id, runId: rid, ...result });
      return result;
    } finally {
      await this.store.releaseLease(id, rid);
    }
  }

  async finish(task, rid, result, now) {
    const id = task.TaskID || task.id || task.Task;
    let next = null;
    let enabled = task.Enabled;
    if (result.selfDisable || String(task.Cadence || '').toUpperCase().startsWith('ONCE ')) {
      enabled = false;
    } else if (!['Waiting Approval', 'Paused'].includes(result.status)) {
      next = nextDue(task.Cadence, now).toISOString();
    }

    await this.store.completeRun(rid, { state: result.status.toUpperCase().replace(' ', '_'), finishedAt: nowIso(new Date()), result });
    await this.store.updateTask(id, {
      Status: result.status === 'Succeeded' || result.status === 'No Change' ? 'Ready' : result.status,
      LastResult: result.message,
      LastRun: nowIso(now),
      NextDue: next,
      Enabled: enabled,
      Attempts: 0
    });
  }
}

module.exports = { TaskEngine, sortDue, isDue, backoffMs, requiresApproval, withTimeout };

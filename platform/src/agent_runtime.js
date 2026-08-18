const crypto = require('crypto');

const TERMINAL = new Set(['completed', 'failed', 'denied', 'cancelled']);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class AgentRuntime {
  constructor({ store, supervisor, executorRegistry = {}, clock = () => new Date(), workerId = `worker-${process.pid}`, leaseMs = 60000 } = {}) {
    if (!store) throw new Error('AgentRuntime requires a store');
    if (!supervisor) throw new Error('AgentRuntime requires a SectionSupervisor');
    this.store = store;
    this.supervisor = supervisor;
    this.executorRegistry = executorRegistry;
    this.clock = clock;
    this.workerId = workerId;
    this.leaseMs = leaseMs;
    this.running = false;
  }

  async enqueue({ sectionId, agentId, trigger, operation, payload = {}, context = {}, priority = 100, maxAttempts = 5, idempotencyKey, correlationId, causationId }) {
    const job = {
      id: crypto.randomUUID(),
      sectionId,
      agentId,
      trigger,
      operation,
      payload,
      context,
      priority,
      maxAttempts,
      idempotencyKey,
      correlationId: correlationId || crypto.randomUUID(),
      causationId,
      availableAt: this.clock().toISOString()
    };
    return this.store.enqueue(job);
  }

  async runOnce() {
    const job = await this.store.claim({ workerId: this.workerId, leaseMs: this.leaseMs, now: this.clock() });
    if (!job) return { status: 'idle' };

    await this.store.heartbeatAgent({
      agentId: job.agentId,
      sectionId: job.sectionId,
      status: 'running',
      currentJobId: job.id,
      at: this.clock()
    });

    const executor = this.executorRegistry[job.operation];
    const started = this.clock();

    try {
      const result = await this.supervisor.run({
        sectionId: job.sectionId,
        trigger: job.trigger,
        operation: job.operation,
        actor: { type: 'ai_agent', id: job.agentId },
        context: { ...job.context, jobId: job.id, correlationId: job.correlationId },
        execute: executor ? args => executor({ ...args, job }) : undefined
      });

      if (result.status === 'awaiting_approval') {
        await this.store.markAwaitingApproval({ jobId: job.id, result, at: this.clock() });
      } else if (result.status === 'denied') {
        await this.store.complete({ jobId: job.id, status: 'denied', result, at: this.clock() });
      } else if (result.status === 'planned' && !executor) {
        await this.store.complete({ jobId: job.id, status: 'completed', result, at: this.clock() });
      } else {
        await this.store.complete({ jobId: job.id, status: 'completed', result, at: this.clock() });
      }

      await this.store.recordReceipt({
        id: crypto.randomUUID(),
        jobId: job.id,
        sectionId: job.sectionId,
        agentId: job.agentId,
        runNumber: (job.attempts || 0) + 1,
        status: result.status,
        policyDecision: result.policyDecision,
        startedAt: started,
        completedAt: this.clock(),
        evidence: result
      });

      await this.store.heartbeatAgent({
        agentId: job.agentId,
        sectionId: job.sectionId,
        status: result.status === 'awaiting_approval' ? 'blocked' : 'idle',
        currentJobId: null,
        at: this.clock(),
        completed: result.status !== 'awaiting_approval'
      });

      return result;
    } catch (error) {
      const attempts = (job.attempts || 0) + 1;
      const retryable = attempts < (job.maxAttempts || 5);
      const delayMs = Math.min(15 * 60 * 1000, 1000 * (2 ** Math.min(attempts, 10)));

      if (retryable) {
        await this.store.retry({ jobId: job.id, attempts, availableAt: new Date(this.clock().getTime() + delayMs), error });
      } else {
        await this.store.complete({ jobId: job.id, status: 'failed', error, at: this.clock() });
      }

      await this.store.recordReceipt({
        id: crypto.randomUUID(),
        jobId: job.id,
        sectionId: job.sectionId,
        agentId: job.agentId,
        runNumber: attempts,
        status: retryable ? 'retrying' : 'failed',
        startedAt: started,
        completedAt: this.clock(),
        error: { name: error.name, message: error.message }
      });

      await this.store.heartbeatAgent({
        agentId: job.agentId,
        sectionId: job.sectionId,
        status: retryable ? 'degraded' : 'failed',
        currentJobId: null,
        at: this.clock(),
        error
      });

      return { status: retryable ? 'retrying' : 'failed', jobId: job.id, attempts, error: error.message };
    }
  }

  async start({ pollMs = 1000, signal } = {}) {
    if (this.running) return;
    this.running = true;
    while (this.running && !signal?.aborted) {
      const result = await this.runOnce();
      if (result.status === 'idle') await sleep(pollMs);
    }
    this.running = false;
  }

  stop() {
    this.running = false;
  }

  async runHealthSweep() {
    const agents = await this.store.listAgents();
    const now = this.clock();
    const findings = [];
    for (const agent of agents) {
      const last = agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt) : null;
      const stale = !last || (now - last) > Math.max(this.leaseMs * 2, 120000);
      const healthState = stale ? 'failed' : agent.status === 'failed' ? 'failed' : agent.status === 'degraded' ? 'degraded' : 'healthy';
      const finding = { agentId: agent.agentId, sectionId: agent.sectionId, healthState, stale, checkedAt: now.toISOString() };
      findings.push(finding);
      await this.store.recordHealth({ id: crypto.randomUUID(), ...finding, checkName: 'runtime-heartbeat' });
    }
    return findings;
  }

  async reapExpiredLeases() {
    return this.store.requeueExpiredLeases({ now: this.clock() });
  }
}

class MemoryAgentStore {
  constructor() {
    this.jobs = [];
    this.agents = new Map();
    this.receipts = [];
    this.health = [];
  }

  async enqueue(job) {
    if (job.idempotencyKey) {
      const existing = this.jobs.find(x => x.idempotencyKey === job.idempotencyKey && !TERMINAL.has(x.status));
      if (existing) return existing;
    }
    const row = { ...job, status: 'queued', attempts: 0, createdAt: new Date().toISOString() };
    this.jobs.push(row);
    return row;
  }

  async claim({ workerId, leaseMs, now }) {
    const row = this.jobs
      .filter(j => j.status === 'queued' && new Date(j.availableAt) <= now)
      .sort((a, b) => a.priority - b.priority || new Date(a.createdAt) - new Date(b.createdAt))[0];
    if (!row) return null;
    row.status = 'running';
    row.leaseOwner = workerId;
    row.leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    row.startedAt = now.toISOString();
    return { ...row };
  }

  async complete({ jobId, status, result, error, at }) {
    const row = this.jobs.find(j => j.id === jobId);
    Object.assign(row, { status, result, error: error ? { name: error.name, message: error.message } : undefined, completedAt: at.toISOString(), leaseOwner: null, leaseExpiresAt: null });
  }

  async retry({ jobId, attempts, availableAt, error }) {
    const row = this.jobs.find(j => j.id === jobId);
    Object.assign(row, { status: 'queued', attempts, availableAt: availableAt.toISOString(), leaseOwner: null, leaseExpiresAt: null, error: { name: error.name, message: error.message } });
  }

  async markAwaitingApproval({ jobId, result, at }) {
    const row = this.jobs.find(j => j.id === jobId);
    Object.assign(row, { status: 'awaiting_approval', result, updatedAt: at.toISOString(), leaseOwner: null, leaseExpiresAt: null });
  }

  async heartbeatAgent({ agentId, sectionId, status, currentJobId, at, error, completed }) {
    const prior = this.agents.get(agentId) || { agentId, sectionId, consecutiveFailures: 0 };
    const next = {
      ...prior,
      sectionId,
      status,
      currentJobId,
      lastHeartbeatAt: at.toISOString(),
      lastError: error ? { name: error.name, message: error.message } : prior.lastError,
      lastCompletedAt: completed ? at.toISOString() : prior.lastCompletedAt,
      consecutiveFailures: status === 'failed' ? (prior.consecutiveFailures || 0) + 1 : status === 'idle' ? 0 : prior.consecutiveFailures || 0
    };
    this.agents.set(agentId, next);
    return next;
  }

  async recordReceipt(receipt) { this.receipts.push(receipt); }
  async recordHealth(finding) { this.health.push(finding); }
  async listAgents() { return [...this.agents.values()]; }

  async requeueExpiredLeases({ now }) {
    let count = 0;
    for (const job of this.jobs) {
      if (job.status === 'running' && job.leaseExpiresAt && new Date(job.leaseExpiresAt) <= now) {
        job.status = 'queued';
        job.leaseOwner = null;
        job.leaseExpiresAt = null;
        job.availableAt = now.toISOString();
        count += 1;
      }
    }
    return count;
  }
}

module.exports = { AgentRuntime, MemoryAgentStore };

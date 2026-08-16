'use strict';

class MemoryStore {
  constructor(tasks = []) {
    this.tasks = new Map(tasks.map(t => [t.TaskID || t.id || t.Task, { ...t }]));
    this.leases = new Map();
    this.runs = new Map();
    this.deadLetters = [];
  }

  async listTasks() { return [...this.tasks.values()].map(t => ({ ...t })); }

  async acquireLease(taskId, runId, expiresAt) {
    const current = this.leases.get(taskId);
    const now = Date.now();
    if (current && new Date(current.expiresAt).getTime() > now && current.runId !== runId) return false;
    this.leases.set(taskId, { runId, expiresAt: expiresAt.toISOString() });
    return true;
  }

  async releaseLease(taskId, runId) {
    const current = this.leases.get(taskId);
    if (current?.runId === runId) this.leases.delete(taskId);
  }

  async recordRun(run) {
    if (this.runs.has(run.runId)) throw new Error('duplicate_run_id');
    this.runs.set(run.runId, { ...run });
  }

  async completeRun(runId, patch) {
    const current = this.runs.get(runId) || { runId };
    this.runs.set(runId, { ...current, ...patch });
  }

  async updateTask(taskId, patch) {
    const current = this.tasks.get(taskId);
    if (!current) throw new Error('task_not_found');
    this.tasks.set(taskId, { ...current, ...patch });
  }

  async deadLetter(entry) { this.deadLetters.push({ ...entry }); }
}

module.exports = { MemoryStore };

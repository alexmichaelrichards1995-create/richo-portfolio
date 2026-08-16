'use strict';

class ControlPlaneStore {
  constructor({ durableStore, notion }) {
    if (!durableStore) throw new Error('durable_store_required');
    this.durable = durableStore;
    this.notion = notion || null;
  }

  async listTasks() { return this.durable.listTasks(); }
  async acquireLease(...args) { return this.durable.acquireLease(...args); }
  async releaseLease(...args) { return this.durable.releaseLease(...args); }
  async recordRun(...args) { return this.durable.recordRun(...args); }
  async completeRun(...args) { return this.durable.completeRun(...args); }
  async deadLetter(...args) { return this.durable.deadLetter(...args); }
  async metrics(...args) { return this.durable.metrics(...args); }

  async updateTask(taskId, patch) {
    let notionPageId = null;
    if (this.notion) {
      const tasksBeforeUpdate = await this.durable.listTasks();
      const current = tasksBeforeUpdate.find(t => String(t.TaskID) === String(taskId));
      notionPageId = current?.NotionPageID || null;
    }

    await this.durable.updateTask(taskId, patch);
    if (!this.notion || !notionPageId) return;

    try {
      await this.notion.updateTaskPage(notionPageId, patch);
    } catch (err) {
      // Notion is the human control plane, not the lease authority. A failed mirror
      // must not roll back an already durable task-state transition.
      if (this.durable.deadLetter) {
        await this.durable.deadLetter({
          taskId,
          runId: `notion-sync-${Date.now()}`,
          classification: 'CONTROL_PLANE_SYNC',
          message: err.message || String(err),
          patch
        });
      }
    }
  }
}

module.exports = { ControlPlaneStore };

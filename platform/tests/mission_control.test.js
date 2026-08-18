const assert = require('assert');
const { MissionControlService } = require('../src/mission_control_service');

class FakePool {
  constructor() { this.controls = []; this.commands = []; }
  async query(sql, values = []) {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('SELECT * FROM richo_section_control')) return { rows: this.controls };
    if (sql.includes('INSERT INTO richo_operator_commands')) {
      this.commands.push({ id: values[0], section_id: values[1], requested_state: values[3] });
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO richo_section_control')) {
      const row = {
        section_id: values[0], desired_state: values[1], effective_state: values[2],
        pause_reason: values[3], last_changed_by: values[4], last_changed_at: values[5]
      };
      const index = this.controls.findIndex(x => x.section_id === row.section_id);
      if (index >= 0) this.controls[index] = row; else this.controls.push(row);
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

const runtimeStore = {
  async listAgents() { return [{ agentId: 'commerce-agent', sectionId: 'commerce', status: 'idle', lastHeartbeatAt: new Date().toISOString() }]; },
  async listJobs({ status } = {}) {
    const jobs = [
      { id: 'j1', sectionId: 'commerce', agentId: 'commerce-agent', status: 'queued', operation: 'sync:catalog' },
      { id: 'j2', sectionId: 'sales', agentId: 'sales-intelligence-agent', status: 'awaiting_approval', operation: 'send:external-message' }
    ];
    return status ? jobs.filter(j => j.status === status) : jobs;
  },
  async getRuntimeSummary() { return { jobs: { queued: 1, awaiting_approval: 1 }, agents: { idle: 1 } }; }
};

(async () => {
  const pool = new FakePool();
  const memoryStore = { async recall() { return [{ id: 'm1', memoryType: 'decision', content: { approved: true } }]; } };
  const service = new MissionControlService({ pool, runtimeStore, memoryStore });

  const dashboard = await service.dashboard();
  assert.equal(dashboard.approvals, 1);
  assert.ok(dashboard.sections.find(s => s.id === 'commerce'));
  assert.equal(dashboard.sections.find(s => s.id === 'commerce').queuedJobs, 1);

  const paused = await service.setSectionState({ sectionId: 'commerce', desiredState: 'paused', reason: 'maintenance', actor: { type: 'human', id: 'owner' } });
  assert.equal(paused.desiredState, 'paused');
  assert.equal(pool.controls[0].desired_state, 'paused');
  assert.equal(pool.commands.length, 1);

  const detail = await service.sectionDetail('commerce');
  assert.equal(detail.memories.length, 1);
  assert.equal(detail.desiredState, 'paused');

  console.log('mission_control.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

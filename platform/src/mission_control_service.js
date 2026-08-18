const crypto = require('crypto');
const { listSections } = require('./section_registry');

class MissionControlService {
  constructor({ pool, runtimeStore, memoryStore, clock = () => new Date() } = {}) {
    if (!pool) throw new Error('MissionControlService requires pg Pool');
    if (!runtimeStore) throw new Error('MissionControlService requires runtimeStore');
    this.pool = pool;
    this.runtimeStore = runtimeStore;
    this.memoryStore = memoryStore;
    this.clock = clock;
  }

  async dashboard() {
    const [agents, jobs, summary, controls, approvals] = await Promise.all([
      this.runtimeStore.listAgents(),
      this.runtimeStore.listJobs({ limit: 100 }),
      this.runtimeStore.getRuntimeSummary(),
      this.pool.query('SELECT * FROM richo_section_control ORDER BY section_id'),
      this.runtimeStore.listJobs({ status: 'awaiting_approval', limit: 100 })
    ]);

    const controlMap = new Map(controls.rows.map(r => [r.section_id, r]));
    const agentMap = new Map(agents.map(a => [a.sectionId, a]));
    const sections = listSections().map(section => {
      const control = controlMap.get(section.id);
      const agent = agentMap.get(section.id);
      const sectionJobs = jobs.filter(j => j.sectionId === section.id);
      return {
        id: section.id,
        name: section.name,
        agentId: section.ownerAgent,
        mode: section.mode,
        desiredState: control?.desired_state || 'running',
        effectiveState: control?.effective_state || agent?.status || 'idle',
        pauseReason: control?.pause_reason || null,
        health: deriveHealth(agent, sectionJobs),
        currentJobId: agent?.currentJobId || null,
        lastHeartbeatAt: agent?.lastHeartbeatAt || null,
        lastCompletedAt: agent?.lastCompletedAt || null,
        queuedJobs: sectionJobs.filter(j => j.status === 'queued').length,
        runningJobs: sectionJobs.filter(j => j.status === 'running').length,
        awaitingApproval: sectionJobs.filter(j => j.status === 'awaiting_approval').length,
        failedJobs: sectionJobs.filter(j => j.status === 'failed').length
      };
    });

    return {
      generatedAt: this.clock().toISOString(),
      summary,
      approvals: approvals.length,
      sections,
      recentJobs: jobs.slice(0, 25)
    };
  }

  async setSectionState({ sectionId, desiredState, reason, actor = {} }) {
    if (!['running', 'paused'].includes(desiredState)) throw new Error('desiredState must be running or paused');
    const now = this.clock();
    const commandId = crypto.randomUUID();
    const actorLabel = `${actor.type || 'human'}:${actor.id || 'owner'}`;

    await this.pool.query('BEGIN');
    try {
      await this.pool.query(`
        INSERT INTO richo_operator_commands (
          id, section_id, command, requested_state, reason, actor_type, actor_id,
          status, applied_at, evidence
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'applied',$8,$9::jsonb)`, [
          commandId, sectionId, desiredState === 'paused' ? 'pause' : 'resume',
          desiredState, reason || null, actor.type || 'human', actor.id || 'owner', now,
          JSON.stringify({ actor: actorLabel })
        ]);

      await this.pool.query(`
        INSERT INTO richo_section_control (
          section_id, desired_state, effective_state, pause_reason, last_changed_by, last_changed_at
        ) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (section_id) DO UPDATE SET
          desired_state=EXCLUDED.desired_state,
          effective_state=EXCLUDED.effective_state,
          pause_reason=EXCLUDED.pause_reason,
          last_changed_by=EXCLUDED.last_changed_by,
          last_changed_at=EXCLUDED.last_changed_at`, [
          sectionId, desiredState, desiredState === 'paused' ? 'paused' : 'idle',
          desiredState === 'paused' ? reason || 'Paused by operator' : null,
          actorLabel, now
        ]);
      await this.pool.query('COMMIT');
    } catch (error) {
      await this.pool.query('ROLLBACK');
      throw error;
    }

    return { commandId, sectionId, desiredState, appliedAt: now.toISOString() };
  }

  async sectionDetail(sectionId) {
    const dashboard = await this.dashboard();
    const section = dashboard.sections.find(s => s.id === sectionId);
    if (!section) return null;
    const memories = this.memoryStore
      ? await this.memoryStore.recall({ sectionId, limit: 20 })
      : [];
    const jobs = await this.runtimeStore.listJobs({ limit: 100 });
    return {
      ...section,
      recentJobs: jobs.filter(j => j.sectionId === sectionId).slice(0, 20),
      memories
    };
  }
}

function deriveHealth(agent, jobs) {
  if (agent?.status === 'failed') return 'critical';
  if (jobs.some(j => j.status === 'failed')) return 'degraded';
  if (agent?.status === 'degraded') return 'degraded';
  if (!agent) return 'unknown';
  return 'healthy';
}

module.exports = { MissionControlService };

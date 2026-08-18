const crypto = require('crypto');
const { listSections } = require('./section_registry');

class RuntimeScheduler {
  constructor({ runtime, store, clock = () => new Date() } = {}) {
    if (!runtime) throw new Error('RuntimeScheduler requires AgentRuntime');
    if (!store) throw new Error('RuntimeScheduler requires store');
    this.runtime = runtime;
    this.store = store;
    this.clock = clock;
    this.running = false;
  }

  async tick() {
    const now = this.clock();
    const schedules = await this.store.listDueSchedules?.({ now }) || [];
    const enqueued = [];

    for (const schedule of schedules) {
      const section = listSections().find(x => x.id === schedule.sectionId);
      if (!section) continue;
      const key = `schedule:${schedule.id}:${new Date(schedule.nextRunAt).toISOString()}`;
      const job = await this.runtime.enqueue({
        sectionId: schedule.sectionId,
        agentId: schedule.agentId || section.ownerAgent,
        trigger: schedule.trigger,
        operation: schedule.operation,
        payload: schedule.payload || {},
        context: { ...(schedule.context || {}), scheduleId: schedule.id },
        priority: schedule.priority ?? 100,
        maxAttempts: schedule.maxAttempts ?? 5,
        idempotencyKey: key,
        correlationId: crypto.randomUUID()
      });
      enqueued.push(job);
      await this.store.advanceSchedule?.({ schedule, now });
    }

    const recovered = await this.runtime.reapExpiredLeases();
    return { enqueued: enqueued.length, recovered };
  }

  async start({ intervalMs = 15000, signal } = {}) {
    if (this.running) return;
    this.running = true;
    while (this.running && !signal?.aborted) {
      await this.tick();
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    this.running = false;
  }

  stop() { this.running = false; }
}

module.exports = { RuntimeScheduler };

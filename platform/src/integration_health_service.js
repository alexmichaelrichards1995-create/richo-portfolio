class IntegrationHealthService {
  constructor({ store, adapters = {}, eventFabric, clock = () => new Date() } = {}) {
    if (!store) throw new Error('IntegrationHealthService requires store');
    this.store = store;
    this.adapters = adapters;
    this.eventFabric = eventFabric;
    this.clock = clock;
  }

  async checkAll() {
    const results = [];
    for (const [name, adapter] of Object.entries(this.adapters)) {
      const started = this.clock();
      let health;
      try {
        if (typeof adapter.healthCheck === 'function') await adapter.healthCheck();
        health = {
          name,
          state: adapter.breaker?.state === 'open' ? 'degraded' : 'healthy',
          circuitState: adapter.breaker?.state || 'unknown',
          latencyMs: this.clock() - started,
          checkedAt: this.clock().toISOString()
        };
      } catch (error) {
        health = {
          name,
          state: 'failed',
          circuitState: adapter.breaker?.state || 'unknown',
          latencyMs: this.clock() - started,
          error: { name: error.name, message: error.message },
          checkedAt: this.clock().toISOString()
        };
      }
      results.push(health);
      if (this.store.recordIntegrationHealth) await this.store.recordIntegrationHealth(health);
      if (this.eventFabric?.publish && health.state !== 'healthy') {
        await this.eventFabric.publish({ type: 'integration.health.degraded', source: 'richo.integration-health', payload: health });
      }
    }
    return results;
  }
}

class ReconciliationScheduler {
  constructor({ store, reconciliationWorker, intervalMs = 15 * 60 * 1000, clock = () => new Date() } = {}) {
    if (!store || !reconciliationWorker) throw new Error('ReconciliationScheduler missing dependency');
    this.store = store;
    this.reconciliationWorker = reconciliationWorker;
    this.intervalMs = intervalMs;
    this.clock = clock;
  }

  async tick() {
    const due = await this.store.listDueReconciliationTargets({ now: this.clock() });
    const results = [];
    for (const target of due) {
      const result = await this.reconciliationWorker.reconcile(target);
      await this.store.markReconciliationTargetRun({ id: target.id, at: this.clock(), nextRunAt: new Date(this.clock().getTime() + this.intervalMs), result });
      results.push({ targetId: target.id, result });
    }
    return { processed: results.length, results };
  }
}

module.exports = { IntegrationHealthService, ReconciliationScheduler };

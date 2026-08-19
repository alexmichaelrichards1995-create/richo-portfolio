const crypto = require('crypto');

class TelemetryService {
  constructor({ store, clock = () => new Date() } = {}) { if (!store) throw new Error('TelemetryService requires store'); this.store = store; this.clock = clock; }
  async startTrace({ service, operation, correlationId, attributes = {} }) {
    const traceId = crypto.randomUUID();
    const rootSpanId = crypto.randomUUID();
    await this.store.createTrace({ traceId, rootSpanId, service, operation, correlationId, attributes, startedAt: this.clock() });
    await this.store.createSpan({ spanId: rootSpanId, traceId, service, operation, attributes, startedAt: this.clock() });
    return { traceId, rootSpanId };
  }
  async endSpan({ spanId, status = 'ok', error, attributes = {} }) { return this.store.completeSpan({ spanId, status, error, attributes, completedAt: this.clock() }); }
  async metric({ metricKey, value, unit, service, sectionId, labels = {} }) { return this.store.recordMetric({ metricKey, value: Number(value), unit, service, sectionId, labels, observedAt: this.clock() }); }
}

class SLOService {
  constructor({ store, incidentCommand } = {}) { if (!store) throw new Error('SLOService requires store'); this.store = store; this.incidentCommand = incidentCommand; }
  async evaluate(sloKey) {
    const slo = await this.store.getSLO(sloKey); if (!slo) throw new Error(`Unknown SLO: ${sloKey}`);
    const sample = await this.store.aggregateMetric({ metricKey: slo.indicatorMetricKey, windowSeconds: slo.windowSeconds, service: slo.service, sectionId: slo.sectionId });
    const value = Number(sample.value); const compliant = slo.comparison === 'gte' ? value >= Number(slo.objective) : value <= Number(slo.objective);
    const errorBudgetRemaining = slo.comparison === 'gte' ? Math.max(0, value - Number(slo.objective)) : Math.max(0, Number(slo.objective) - value);
    const evaluation = await this.store.recordSLOEvaluation({ sloId: slo.id, measuredValue: value, objective: Number(slo.objective), compliant, errorBudgetRemaining, windowStart: sample.windowStart, windowEnd: sample.windowEnd, evidence: sample.evidence || {} });
    if (!compliant && this.incidentCommand) await this.incidentCommand.openFromSLOBreach({ slo, evaluation });
    return evaluation;
  }
}

class AnomalyDetector {
  constructor({ zThreshold = 3 } = {}) { this.zThreshold = zThreshold; }
  detect(samples = []) {
    if (samples.length < 5) return { anomalous: false, reason: 'insufficient_data' };
    const values = samples.slice(0, -1).map(Number); const latest = Number(samples[samples.length - 1]);
    const mean = values.reduce((a,b) => a+b,0) / values.length;
    const variance = values.reduce((a,b) => a + ((b - mean) ** 2), 0) / values.length;
    const sd = Math.sqrt(variance); if (sd === 0) return { anomalous: latest !== mean, zScore: latest === mean ? 0 : Infinity, mean, sd, latest };
    const zScore = Math.abs((latest - mean) / sd);
    return { anomalous: zScore >= this.zThreshold, zScore, mean, sd, latest };
  }
}

class IncidentCommand {
  constructor({ store, policyEngine, toolRegistry, eventFabric, memoryStore } = {}) { if (!store) throw new Error('IncidentCommand requires store'); Object.assign(this, { store, policyEngine, toolRegistry, eventFabric, memoryStore }); }
  async open({ title, severity = 'sev3', source, sectionId, service, correlationId, summary, metadata = {} }) {
    const incident = await this.store.createIncident({ incidentKey: `INC-${Date.now()}-${crypto.randomUUID().slice(0,8)}`, title, severity, source, sectionId, service, correlationId, summary, metadata });
    await this.#emit('incident.opened', incident); return incident;
  }
  async openFromSLOBreach({ slo, evaluation }) { return this.open({ title: `SLO breach: ${slo.name}`, severity: 'sev2', source: 'slo', sectionId: slo.sectionId, service: slo.service, summary: `Measured ${evaluation.measuredValue} vs objective ${evaluation.objective}`, metadata: { sloKey: slo.sloKey, evaluationId: evaluation.id } }); }
  async diagnose({ incidentId, agentId, hypothesis, confidence, evidence = [], recommendedActions = [] }) { const diagnosis = await this.store.createIncidentDiagnosis({ incidentId, agentId, hypothesis, confidence, evidence, recommendedActions }); await this.#emit('incident.diagnosis.created', diagnosis); return diagnosis; }
  async remediate({ incidentId, operation, toolName, args = {}, actor = { type: 'ai_agent', id: 'operations-agent' }, environment = 'development', risk = 'low' }) {
    const policy = await this.policyEngine.evaluate({ actor, capability: `remediate:${operation}`, operation, environment, risk, dataClassification: 'internal' });
    if (policy.decision !== 'allow') return this.store.recordRemediation({ incidentId, operation, risk, policyDecision: policy.decision, status: policy.decision === 'require_approval' ? 'awaiting_approval' : 'denied' });
    const receipt = await this.toolRegistry.invoke(toolName, args, { actor, environment, risk, incidentId });
    const run = await this.store.recordRemediation({ incidentId, operation, risk, policyDecision: 'allow', status: receipt.status || 'completed', toolReceipt: receipt });
    await this.#emit('incident.remediation.executed', run); return run;
  }
  async resolve({ incidentId, summary, lessons = [] }) {
    const incident = await this.store.resolveIncident({ incidentId, summary, resolvedAt: new Date() });
    if (this.memoryStore?.remember) await this.memoryStore.remember({ sectionId: incident.sectionId || 'operations', agentId: 'operations-agent', subjectType: 'incident', subjectId: incident.id, kind: 'incident_learning', content: { summary, lessons }, importance: 0.95, confidence: 0.9 });
    await this.#emit('incident.resolved', { incident, lessons }); return incident;
  }
  async #emit(type, payload) { if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.incident-command', payload }); }
}

module.exports = { TelemetryService, SLOService, AnomalyDetector, IncidentCommand };

const assert = require('assert');
const { AnomalyDetector, IncidentCommand } = require('../src/observability_sre');

(async () => {
  const detector = new AnomalyDetector({ zThreshold: 2 });
  const anomaly = detector.detect([10, 11, 10, 9, 10, 30]);
  assert.equal(anomaly.anomalous, true);

  const remediations = [];
  const memories = [];
  const store = {
    async createIncident(x) { return { id: 'inc1', ...x }; },
    async recordRemediation(x) { remediations.push(x); return x; },
    async createIncidentDiagnosis(x) { return { id: 'diag1', ...x }; },
    async resolveIncident({ incidentId, summary }) { return { id: incidentId, sectionId: 'operations', summary, status: 'resolved' }; }
  };
  const command = new IncidentCommand({
    store,
    policyEngine: { async evaluate({ risk }) { return { decision: risk === 'high' ? 'require_approval' : 'allow' }; } },
    toolRegistry: { async invoke(name, args) { return { status: 'completed', tool: name, result: args }; } },
    memoryStore: { async remember(x) { memories.push(x); } }
  });

  const incident = await command.open({ title: 'Checkout failures', source: 'test', service: 'commerce' });
  assert.equal(incident.id, 'inc1');

  const blocked = await command.remediate({ incidentId: 'inc1', operation: 'disable-production-integration', toolName: 'disable', risk: 'high', environment: 'production' });
  assert.equal(blocked.status, 'awaiting_approval');

  const allowed = await command.remediate({ incidentId: 'inc1', operation: 'retry-job', toolName: 'retry', args: { id: 'job1' }, risk: 'low' });
  assert.equal(allowed.status, 'completed');

  await command.resolve({ incidentId: 'inc1', summary: 'Recovered', lessons: ['Add earlier alerting'] });
  assert.equal(memories.length, 1);
  console.log('observability_sre.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

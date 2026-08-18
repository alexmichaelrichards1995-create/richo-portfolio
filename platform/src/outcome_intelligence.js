class OutcomeIntelligence {
  constructor({ store, eventFabric, minimumObservations = 2 } = {}) {
    if (!store) throw new Error('OutcomeIntelligence requires store');
    this.store = store;
    this.eventFabric = eventFabric;
    this.minimumObservations = minimumObservations;
  }

  async registerMetric(metric) {
    validateMetric(metric);
    return this.store.upsertOutcomeMetric(metric);
  }

  async observe({ metricId, value, source, correlationId, evidence = {} }) {
    if (!Number.isFinite(Number(value))) throw new Error('Outcome value must be numeric');
    const observation = await this.store.recordOutcomeObservation({ metricId, value: Number(value), source, correlationId, evidence });
    await this.#emit('outcome.observed', { metricId, value: Number(value), source, correlationId });
    return observation;
  }

  async proposeExperiment({ sectionId, agentId, title, hypothesis, baseline = {}, expectedOutcome = {}, risk = 'low', correlationId }) {
    if (!sectionId || !title || !hypothesis) throw new Error('Experiment requires sectionId, title and hypothesis');
    const experiment = await this.store.createImprovementExperiment({ sectionId, agentId, title, hypothesis, baseline, expectedOutcome, risk, correlationId });
    await this.#emit('improvement.experiment.proposed', experiment);
    return experiment;
  }

  async evaluateExperiment({ experimentId, metricKey, baselineValue, finalValue, higherIsBetter = true, confidence = null, evidence = {} }) {
    const baseline = Number(baselineValue);
    const final = Number(finalValue);
    if (!Number.isFinite(baseline) || !Number.isFinite(final)) throw new Error('Experiment values must be numeric');
    const delta = final - baseline;
    const deltaPercent = baseline === 0 ? null : (delta / Math.abs(baseline)) * 100;
    let verdict = 'unchanged';
    if (delta !== 0) verdict = higherIsBetter ? (delta > 0 ? 'improved' : 'regressed') : (delta < 0 ? 'improved' : 'regressed');
    const result = await this.store.recordExperimentResult({ experimentId, metricKey, baselineValue: baseline, finalValue: final, delta, deltaPercent, verdict, confidence, evidence });
    await this.#emit(`improvement.experiment.${verdict}`, result);
    return result;
  }

  async buildScorecard({ sectionId, windowDays = 30 }) {
    const metrics = await this.store.getSectionOutcomeScorecard({ sectionId, windowDays });
    const counts = { improved: 0, regressed: 0, unchanged: 0, insufficient_data: 0 };
    for (const metric of metrics) counts[metric.verdict] = (counts[metric.verdict] || 0) + 1;
    const measurable = counts.improved + counts.regressed + counts.unchanged;
    return {
      sectionId,
      windowDays,
      metrics,
      counts,
      improvementRate: measurable ? counts.improved / measurable : null,
      regressionRate: measurable ? counts.regressed / measurable : null,
      generatedAt: new Date().toISOString()
    };
  }

  async #emit(type, payload) {
    if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.outcome-intelligence', payload });
  }
}

function validateMetric(metric = {}) {
  if (!metric.metricKey || !metric.subjectType || !metric.subjectId || !metric.unit) throw new Error('Metric requires key, subject, and unit');
  if (!['higher_is_better', 'lower_is_better', 'target'].includes(metric.direction)) throw new Error('Invalid metric direction');
}

module.exports = { OutcomeIntelligence, validateMetric };

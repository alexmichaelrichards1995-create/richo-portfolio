const crypto = require('crypto');

class ExperimentationCausalLearningEngine {
  constructor({ store, eventFabric, improvementEngine } = {}) {
    if (!store) throw new Error('ExperimentationCausalLearningEngine requires store');
    Object.assign(this, { store, eventFabric, improvementEngine });
  }

  async createExperiment({ name, hypothesis, unit = 'customer', variants, primaryMetric, guardrails = [], minimumSampleSize = 100, confidenceThreshold = .95, maxDurationDays = 30, context = {} }) {
    if (!hypothesis || !primaryMetric || !Array.isArray(variants) || variants.length < 2) throw new Error('Experiment requires hypothesis, primary metric, and at least two variants');
    const experiment = await this.store.createCausalExperiment({ id: crypto.randomUUID(), name, hypothesis, unit, variants, primaryMetric, guardrails, minimumSampleSize, confidenceThreshold, maxDurationDays, status: 'draft', correlationId: context.correlationId });
    await this.#emit('experiment.created', { experimentId: experiment.id, name });
    return experiment;
  }

  assign({ experimentId, subjectId, variants }) {
    if (!subjectId || !variants?.length) throw new Error('Assignment requires subject and variants');
    const hash = crypto.createHash('sha256').update(`${experimentId}:${subjectId}`).digest();
    const bucket = hash.readUInt32BE(0) / 0xffffffff;
    let cumulative = 0;
    for (const variant of variants) {
      cumulative += Number(variant.weight ?? 1 / variants.length);
      if (bucket <= cumulative) return { experimentId, subjectId, variantId: variant.id, bucket };
    }
    return { experimentId, subjectId, variantId: variants.at(-1).id, bucket };
  }

  evaluate({ control, treatment, guardrails = [], minimumSampleSize = 100, confidenceThreshold = .95 }) {
    const c = normalizeArm(control), t = normalizeArm(treatment);
    const effect = t.rate - c.rate;
    const relativeLift = c.rate ? effect / c.rate : null;
    const pooled = (c.successes + t.successes) / (c.n + t.n || 1);
    const se = Math.sqrt(Math.max(1e-12, pooled * (1 - pooled) * (1 / Math.max(c.n,1) + 1 / Math.max(t.n,1))));
    const z = effect / se;
    const confidence = normalConfidence(Math.abs(z));
    const sampleReady = c.n >= minimumSampleSize && t.n >= minimumSampleSize;
    const guardrailBreaches = guardrails.filter(g => Number(g.current) > Number(g.maximum ?? Infinity) || Number(g.current) < Number(g.minimum ?? -Infinity));
    const significant = sampleReady && confidence >= confidenceThreshold;
    const verdict = guardrailBreaches.length ? 'stop_guardrail' : !sampleReady ? 'continue_collecting' : significant ? (effect > 0 ? 'treatment_wins' : 'control_wins') : 'inconclusive';
    return { control:c, treatment:t, effect, relativeLift, z, confidence, sampleReady, significant, guardrailBreaches, verdict };
  }

  async conclude({ experimentId, analysis, context = {} }) {
    const causalClaimAllowed = analysis.significant && !analysis.guardrailBreaches.length && ['treatment_wins','control_wins'].includes(analysis.verdict);
    const result = await this.store.completeCausalExperiment({ experimentId, analysis, causalClaimAllowed, status: analysis.verdict === 'continue_collecting' ? 'running' : 'completed', correlationId: context.correlationId });
    if (causalClaimAllowed) await this.store.createValidatedLearning({ experimentId, learningType:'causal_experiment', conclusion: analysis.verdict, effect: analysis.effect, relativeLift: analysis.relativeLift, confidence: analysis.confidence, evidence: analysis });
    await this.#emit('experiment.evaluated', { experimentId, verdict: analysis.verdict, causalClaimAllowed });
    return { ...result, causalClaimAllowed };
  }

  async feedImprovement({ experiment, analysis, proposedChange, context = {} }) {
    if (!this.improvementEngine || !analysis.significant || analysis.verdict !== 'treatment_wins' || analysis.guardrailBreaches.length) return { status:'not_eligible' };
    return this.improvementEngine.improve({ sectionId: proposedChange.sectionId, agentId: proposedChange.agentId, opportunity: { title:`Adopt winning experiment ${experiment.name}`, hypothesis:experiment.hypothesis }, metric: { metricKey:experiment.primaryMetric, baselineValue:analysis.control.rate, finalValue:analysis.treatment.rate, direction:'higher_is_better' }, proposedChange, context });
  }

  async #emit(type,payload){ if(this.eventFabric?.publish) await this.eventFabric.publish({type,source:'richo.experimentation-causal-learning',payload}); }
}

function normalizeArm(x={}) { const n=Number(x.n||0), successes=Number(x.successes||0); return { n, successes, rate:n?successes/n:0 }; }
function normalConfidence(z){ const p=0.5*(1+erf(z/Math.sqrt(2))); return Math.max(0,Math.min(1,2*p-1)); }
function erf(x){ const sign=x<0?-1:1,a=Math.abs(x),t=1/(1+.3275911*a); return sign*(1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t)*Math.exp(-a*a)); }

module.exports={ExperimentationCausalLearningEngine};

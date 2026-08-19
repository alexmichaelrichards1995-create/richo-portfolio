const assert=require('assert');
const {ExperimentationCausalLearningEngine}=require('../src/experimentation_causal_learning');
(async()=>{
 let learning=null;
 const store={
  async createCausalExperiment(x){return x;},
  async completeCausalExperiment(x){return x;},
  async createValidatedLearning(x){learning=x;return x;}
 };
 const engine=new ExperimentationCausalLearningEngine({store});
 const exp=await engine.createExperiment({name:'CTA test',hypothesis:'New CTA increases activation',variants:[{id:'control',weight:.5},{id:'treatment',weight:.5}],primaryMetric:'activation'});
 assert.ok(exp.id);
 const a1=engine.assign({experimentId:exp.id,subjectId:'customer-1',variants:exp.variants});
 const a2=engine.assign({experimentId:exp.id,subjectId:'customer-1',variants:exp.variants});
 assert.equal(a1.variantId,a2.variantId);
 const analysis=engine.evaluate({control:{n:1000,successes:100},treatment:{n:1000,successes:150},minimumSampleSize:100,confidenceThreshold:.95});
 assert.equal(analysis.verdict,'treatment_wins');
 assert.equal(analysis.significant,true);
 const concluded=await engine.conclude({experimentId:exp.id,analysis});
 assert.equal(concluded.causalClaimAllowed,true);
 assert.ok(learning);
 const unsafe=engine.evaluate({control:{n:1000,successes:100},treatment:{n:1000,successes:160},guardrails:[{name:'refunds',current:.2,maximum:.1}]});
 assert.equal(unsafe.verdict,'stop_guardrail');
 const small=engine.evaluate({control:{n:10,successes:1},treatment:{n:10,successes:5},minimumSampleSize:100});
 assert.equal(small.verdict,'continue_collecting');
 console.log('experimentation_causal_learning.test.js passed');
})().catch(e=>{console.error(e);process.exit(1);});

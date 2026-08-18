'use strict';
/** R.I.C.H.O. Core SDK — shared deterministic governance primitives. */
const VERSION='0.1.0';
const MODES=Object.freeze({SIMULATION:'SIMULATION',DRY_RUN:'DRY_RUN'});
const STATES=Object.freeze({READY:'READY',REVIEW:'REVIEW',BLOCKED:'BLOCKED'});
const freeze=x=>Object.freeze(x);
function bounded(n,min=0,max=100){n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;}
function receipt(type,payload={}){return freeze({id:`richo-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,type,mode:MODES.SIMULATION,at:new Date().toISOString(),payload:freeze({...payload})});}
function evidence(items=[]){const valid=items.filter(x=>x&&x.verified===true).length,total=items.length;return freeze({verified:valid,total,coverage:total?Math.round(valid/total*100):0});}
function gate({score=0,exceptions=0,evidenceCoverage=0}={}){score=bounded(score);evidenceCoverage=bounded(evidenceCoverage);exceptions=Math.max(0,Number(exceptions)||0);let state=STATES.READY,reasons=[];if(evidenceCoverage<70)reasons.push('evidence_below_threshold');if(exceptions>=3)reasons.push('exception_review_required');if(score<60)reasons.push('score_below_threshold');if(exceptions>=6||score<40)state=STATES.BLOCKED;else if(reasons.length)state=STATES.REVIEW;return freeze({state,reasons:freeze(reasons),humanApprovalRequired:true,autonomousExecution:false});}
function simulate(name,input,fn){if(typeof fn!=='function')throw new TypeError('simulation handler required');const output=fn(freeze({...input}));return freeze({name,mode:MODES.SIMULATION,output,receipt:receipt('simulation',{name})});}
module.exports=freeze({VERSION,MODES,STATES,bounded,receipt,evidence,gate,simulate});

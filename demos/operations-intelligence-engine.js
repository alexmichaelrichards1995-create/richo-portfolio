/* R.I.C.H.O. Operations Intelligence Engine — deterministic demo runtime. */
(function(global){
  'use strict';
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const weights=Object.freeze({health:.30,evidence:.30,exceptions:.20,efficiency:.20});
  function score(input){
    const health=clamp(Number(input.health)||0,0,100);
    const evidence=clamp(Number(input.evidence)||0,0,100);
    const exceptions=clamp(Number(input.exceptions)||0,0,20);
    const hours=clamp(Number(input.hours)||0,0,200);
    const exceptionScore=100-(exceptions*5);
    const efficiency=clamp(hours/60*100,0,100);
    return Math.round(health*weights.health+evidence*weights.evidence+exceptionScore*weights.exceptions+efficiency*weights.efficiency);
  }
  function classify(input){
    const readiness=score(input);
    if((Number(input.exceptions)||0)>=6||readiness<55)return {readiness,state:'BLOCKED',gate:'Human remediation required'};
    if((Number(input.exceptions)||0)>=3||readiness<75)return {readiness,state:'REVIEW',gate:'Named-human review required'};
    return {readiness,state:'READY',gate:'Eligible for human approval'};
  }
  function analyse(input){
    const result=classify(input),findings=[];
    if(input.health<85)findings.push('Process health below target');
    if(input.evidence<80)findings.push('Evidence coverage below target');
    if(input.exceptions>2)findings.push('Exception backlog requires review');
    if(input.hours>=40)findings.push('Material simulated efficiency opportunity detected');
    if(!findings.length)findings.push('Signals inside configured demo tolerances');
    return Object.freeze({...result,findings,generatedAt:new Date().toISOString(),mode:'SIMULATION'});
  }
  global.RichoOperationsIntelligence=Object.freeze({score,classify,analyse,weights});
})(typeof window!=='undefined'?window:globalThis);

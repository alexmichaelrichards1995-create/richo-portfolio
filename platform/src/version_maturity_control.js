const LEVELS=Object.freeze({
  L1:{name:'Core',description:'Stable operating foundation',requires:['runtime','policy','evidence','security','release']},
  L2:{name:'Connected',description:'Commerce, integrations and entitlement operations',requires:['shopify','appstle','commerce','integration_health','reconciliation']},
  L3:{name:'Intelligent',description:'Measured AI operations and organisational memory',requires:['ai_execution','memory','analytics','outcomes','experimentation']},
  L4:{name:'Autonomous',description:'Governed self-improvement and coordinated AI sections',requires:['autonomous_improvement','executive_council','digital_twin','portfolio_execution','incident_command']},
  L5:{name:'Enterprise',description:'Production-grade governance, resilience and assurance',requires:['privacy','continuity','third_party_risk','deployment_control','quality_assurance']}
});
class VersionMaturityControl{
 constructor({store}={}){this.store=store;}
 evaluate({capabilities={},tests={},evidence={}}={}){const levels={};let highest='L0';for(const [id,def] of Object.entries(LEVELS)){const missing=def.requires.filter(k=>capabilities[k]!==true);const failedTests=def.requires.filter(k=>tests[k]===false);const missingEvidence=def.requires.filter(k=>evidence[k]===false);const passed=!missing.length&&!failedTests.length&&!missingEvidence.length;levels[id]={...def,passed,missing,failedTests,missingEvidence};if(passed)highest=id;else break;}return{highestCertifiedLevel:highest,levels};}
 async certify({version,level,assessment,commitSha,notes='',context={}}){if(!LEVELS[level])throw new Error('Unknown maturity level');if(!assessment?.levels?.[level]?.passed)return{status:'blocked',reason:'level_requirements_not_met',assessment};if(this.store?.createVersionCertification)return this.store.createVersionCertification({version,level,commitSha,notes,assessment,status:'certified',correlationId:context.correlationId});return{version,level,commitSha,notes,assessment,status:'certified'};}
 compare(a,b){const ai=Number(String(a).replace(/\D/g,''))||0,bi=Number(String(b).replace(/\D/g,''))||0;return Math.sign(ai-bi);}
 releaseLabel({major=1,minor=0,patch=0,level='L1',channel='alpha'}={}){if(!LEVELS[level])throw new Error('Unknown maturity level');const base=`${major}.${minor}.${patch}`;return channel==='stable'?`v${base}-${level.toLowerCase()}`:`v${base}-${level.toLowerCase()}.${channel}`;}
}
module.exports={VersionMaturityControl,LEVELS};

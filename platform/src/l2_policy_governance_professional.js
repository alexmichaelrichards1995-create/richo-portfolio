const crypto=require('crypto');

class L2PolicyGovernanceProfessional{
  constructor({store,clock=()=>new Date(),telemetry}={}){this.store=store||new MemoryGovernanceStore();this.clock=clock;this.telemetry=telemetry||{emit:async()=>{}};}

  async publishPolicy({name,version,scope='global',environment='*',priority=100,effect='allow',conditions={},requiresApprovals=[],separationOfDuties=[],effectiveFrom,effectiveTo,parentPolicyId=null,metadata={}}){
    if(!name||!version) throw new Error('name and version required');
    if(!['allow','deny','require_approval'].includes(effect)) throw new Error('invalid effect');
    const policy={id:crypto.randomUUID(),name,version,scope,environment,priority,effect,conditions,requiresApprovals,separationOfDuties,effectiveFrom:effectiveFrom||this.clock().toISOString(),effectiveTo,parentPolicyId,metadata,status:'active',createdAt:this.clock().toISOString()};
    await this.store.savePolicy(policy); return policy;
  }

  async grantDelegation({principal,capabilities,scope='global',environment='*',expiresAt,grantedBy,reason}){
    if(!expiresAt) throw new Error('temporary delegation requires expiresAt');
    const grant={id:crypto.randomUUID(),principal,capabilities:[...new Set(capabilities||[])],scope,environment,expiresAt,grantedBy,reason,status:'active',createdAt:this.clock().toISOString()};
    await this.store.saveDelegation(grant); return grant;
  }

  async evaluate(request,{dryRun=false}={}){
    const now=this.clock();
    const policies=(await this.store.listPolicies()).filter(p=>this.#active(p,now)&&this.#scopeMatch(p,request)&&this.#conditionsMatch(p.conditions,request));
    const conflicts=this.detectConflicts(policies);
    const ranked=[...policies].sort((a,b)=>a.priority-b.priority||effectRank(b.effect)-effectRank(a.effect));
    let chosen=ranked[0]||null;
    if(conflicts.length) chosen={id:'conflict',effect:'deny',name:'policy_conflict',version:'n/a',priority:-1};
    const delegations=(await this.store.listDelegations(request.actor?.id)).filter(g=>new Date(g.expiresAt)>now&&scopeCovers(g.scope,request.scope)&&envCovers(g.environment,request.environment));
    const delegated=delegations.some(g=>g.capabilities.includes(request.capability));
    let decision=chosen?.effect||'deny';
    let reason=chosen?`matched:${chosen.name}@${chosen.version}`:'no_matching_policy';
    if(decision==='allow'&&!delegated&&request.requiresDelegation){decision='deny';reason='missing_active_delegation';}
    const sod=this.#checkSeparation(chosen,request);
    if(!sod.passed){decision='deny';reason='separation_of_duties_violation';}
    const approvalChain=decision==='require_approval'?this.#approvalChain(chosen,request):[];
    const explanation={decision,reason,policyId:chosen?.id||null,policyVersion:chosen?.version||null,matchedPolicyIds:ranked.map(p=>p.id),conflicts,delegationIds:delegations.map(g=>g.id),separationOfDuties:sod,approvalChain,dryRun};
    if(!dryRun){await this.store.recordDecision({...explanation,id:crypto.randomUUID(),request,createdAt:now.toISOString()});await this.telemetry.emit('policy.decision',explanation);}
    return explanation;
  }

  detectConflicts(policies){
    const out=[];
    for(let i=0;i<policies.length;i++)for(let j=i+1;j<policies.length;j++){
      const a=policies[i],b=policies[j];
      if(a.priority===b.priority&&a.effect!==b.effect&&a.scope===b.scope&&a.environment===b.environment) out.push({a:a.id,b:b.id,reason:'same_priority_conflicting_effect'});
    }
    return out;
  }

  simulate(request,candidates){
    return Promise.all(candidates.map(async candidate=>({candidate,decision:await this.evaluate({...request,...candidate},{dryRun:true})})));
  }

  regressionCheck(cases,engine=this){
    return Promise.all(cases.map(async c=>{const actual=await engine.evaluate(c.request,{dryRun:true});return{name:c.name,expected:c.expected,actual:actual.decision,passed:actual.decision===c.expected,explanation:actual};})).then(results=>({passed:results.every(x=>x.passed),results}));
  }

  governanceSnapshot(){return this.store.snapshot();}

  #active(p,now){return p.status==='active'&&new Date(p.effectiveFrom)<=now&&(!p.effectiveTo||new Date(p.effectiveTo)>now);}
  #scopeMatch(p,r){return scopeCovers(p.scope,r.scope||'global')&&envCovers(p.environment,r.environment||'*');}
  #conditionsMatch(c,r){return Object.entries(c||{}).every(([k,v])=>{const actual=k.split('.').reduce((o,x)=>o?.[x],r);return Array.isArray(v)?v.includes(actual):actual===v;});}
  #checkSeparation(policy,request){const rules=policy?.separationOfDuties||[];for(const rule of rules){if(rule.proposerCannotApprove&&request.proposedBy&&request.approver&&request.proposedBy===request.approver)return{passed:false,rule};if(rule.disallowedActorIds?.includes(request.actor?.id))return{passed:false,rule};}return{passed:true};}
  #approvalChain(policy,request){return (policy?.requiresApprovals||[]).map((step,index)=>({step:index+1,role:step.role||step,minimum:step.minimum||1,scope:request.scope||'global',status:'pending'}));}
}

function effectRank(e){return e==='deny'?3:e==='require_approval'?2:1;}
function scopeCovers(ruleScope,requestScope){return ruleScope==='global'||ruleScope===requestScope||String(requestScope||'').startsWith(`${ruleScope}.`);}
function envCovers(ruleEnv,requestEnv){return ruleEnv==='*'||ruleEnv===requestEnv;}

class MemoryGovernanceStore{
 constructor(){this.policies=[];this.delegations=[];this.decisions=[];}
 async savePolicy(x){this.policies.push(x);return x;} async listPolicies(){return this.policies;}
 async saveDelegation(x){this.delegations.push(x);return x;} async listDelegations(principal){return this.delegations.filter(x=>!principal||x.principal===principal);}
 async recordDecision(x){this.decisions.push(x);return x;}
 snapshot(){return{policies:this.policies.length,activeDelegations:this.delegations.filter(x=>x.status==='active').length,decisions:this.decisions.length,denyRate:this.decisions.length?this.decisions.filter(x=>x.decision==='deny').length/this.decisions.length:0};}
}

module.exports={L2PolicyGovernanceProfessional,MemoryGovernanceStore};

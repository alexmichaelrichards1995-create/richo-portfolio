class Level2ProfessionalControl {
  constructor(){
    this.domains=['runtime','event_fabric','policy_governance','security','observability','release_assurance','continuity','commerce','ai','sales_marketing','customer_success','finance','knowledge','executive'];
    this.dimensions=['depth','automation','integrations','intelligence','security','observability','resilience','testing','operator_ux','commercial_outcomes'];
  }

  assessDomain(domain,evidence={}){
    if(!this.domains.includes(domain)) throw new Error(`Unknown L2 domain: ${domain}`);
    const dimensionScores=Object.fromEntries(this.dimensions.map(k=>[k,Number(evidence.dimensions?.[k]||0)]));
    const weakDimensions=Object.entries(dimensionScores).filter(([,v])=>v<2).map(([k])=>k);
    const gates={
      implementationDelta:evidence.implementationDelta===true,
      deterministicTests:evidence.deterministicTests===true,
      ciEvidence:evidence.ciEvidence===true,
      telemetry:evidence.telemetry===true,
      rollback:evidence.rollback===true,
      noCriticalSecurityBlocker:evidence.noCriticalSecurityBlocker===true
    };
    const gateFailures=Object.entries(gates).filter(([,v])=>!v).map(([k])=>k);
    const complete=!weakDimensions.length&&!gateFailures.length;
    return{domain,complete,dimensionScores,weakDimensions,gates,gateFailures,score:this.#score(dimensionScores,gates)};
  }

  assessPortfolio(evidenceByDomain={}){
    const domains=this.domains.map(d=>this.assessDomain(d,evidenceByDomain[d]||{}));
    const complete=domains.filter(x=>x.complete).length;
    return{
      level:'L2',
      versionTarget:'v1.1.0-l2',
      status:complete===domains.length?'READY_FOR_OWNER_CERTIFICATION':'UPGRADING',
      completeDomains:complete,
      totalDomains:domains.length,
      maturityPct:Math.round((domains.reduce((s,d)=>s+d.score,0)/domains.length)*100)/100,
      blockers:domains.filter(x=>!x.complete).map(x=>({domain:x.domain,weakDimensions:x.weakDimensions,gateFailures:x.gateFailures})),
      domains
    };
  }

  upgradeBacklog(portfolio){
    return portfolio.blockers.flatMap(b=>[
      ...b.weakDimensions.map(d=>({domain:b.domain,type:'dimension',target:d,priority:'P1'})),
      ...b.gateFailures.map(g=>({domain:b.domain,type:'gate',target:g,priority:'P0'}))
    ]);
  }

  #score(dimensions,gates){
    const dim=Object.values(dimensions).reduce((s,v)=>s+Math.min(3,Math.max(0,v)),0)/(this.dimensions.length*3);
    const gate=Object.values(gates).filter(Boolean).length/Object.keys(gates).length;
    return Math.round(((dim*.6)+(gate*.4))*10000)/100;
  }
}
module.exports={Level2ProfessionalControl};

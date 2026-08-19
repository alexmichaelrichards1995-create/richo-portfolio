const assert = require('assert');
const { CustomerSuccessSupportEngine } = require('../src/customer_success_support_engine');

(async () => {
  const store = {
    async createCustomerOnboarding(x){ return {id:'on1',...x}; },
    async createSupportTicket(x){ return {id:'t1',...x}; },
    async getSupportTicket(id){ return {id, customerId:'c1', subject:'Access issue', body:'Cannot open product'}; },
    async createApprovalRequest(x){ return {id:'a1',...x}; },
    async upsertCustomerHealth(x){ return {id:'h1',...x}; },
    async recordCustomerSatisfaction(x){ return {id:'s1',...x}; }
  };
  const executionEngine = { async execute({agentId}) {
    if (agentId==='customer-onboarding-ai') return {status:'completed',output:{steps:['login'],resources:['guide'],firstSuccessMilestone:'open dashboard',supportPath:'portal'}};
    if (agentId==='support-triage-ai') return {status:'completed',output:{category:'access',severity:'medium',summary:'access problem',recommendedAction:'verify entitlement',needsHuman:false}};
    if (agentId==='support-resolution-ai') return {status:'completed',output:{response:'We will verify your entitlement.',actions:['verify_entitlement'],confidence:.9,requiresApproval:false}};
    if (agentId==='retention-risk-ai') return {status:'completed',output:{risk:'low',drivers:[],supportActions:['education'],educationActions:['guide'],expansionEligible:true,confidence:.8}};
    return {status:'completed',output:{action:'member_upgrade',confidence:.7}};
  }};
  const salesEngine = { async recommendRetention(){ return {action:'member_upgrade'}; } };
  const engine = new CustomerSuccessSupportEngine({store,executionEngine,policyEngine:{async evaluate(){return {decision:'allow'};}},salesEngine});

  const healthy = engine.scoreHealth({usageScore:.9,supportScore:.9,paymentScore:1,satisfactionScore:.9,engagementScore:.8,renewalConfidence:.9});
  assert.equal(healthy.status,'healthy');
  const risky = engine.scoreHealth({usageScore:.2,supportScore:.3,paymentScore:.3,satisfactionScore:.2,engagementScore:.2,renewalConfidence:.2});
  assert.ok(['at_risk','critical'].includes(risky.status));

  const onboarding = await engine.onboard({customerId:'c1',productId:'p1',membership:{tier:'pro'},entitlements:['download:p1']});
  assert.equal(onboarding.id,'on1');
  const ticket = await engine.triageTicket({ticket:{customerId:'c1',subject:'Access issue',body:'Cannot open product'}});
  assert.equal(ticket.triage.category,'access');
  const resolution = await engine.proposeResolution({ticketId:'t1'});
  assert.equal(resolution.status,'ready');
  const health = await engine.assessRenewalRisk({customerId:'c1',membership:{tier:'pro'},healthInputs:{usageScore:.9,supportScore:.9,paymentScore:1,satisfactionScore:.9,engagementScore:.9,renewalConfidence:.9}});
  assert.equal(health.expansionRecommendation.action,'member_upgrade');
  const sat = await engine.recordSatisfaction({customerId:'c1',ticketId:null,score:7,comment:'great'});
  assert.equal(sat.score,5);
  console.log('customer_success_support_engine.test.js passed');
})().catch(error=>{console.error(error);process.exit(1);});

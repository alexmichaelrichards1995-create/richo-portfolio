const assert = require('assert');
const { RevenueGrowthSalesEngine } = require('../src/revenue_growth_sales_engine');

(async () => {
  const leads = new Map(); const opportunities = new Map();
  const store = {
    async upsertSalesLead(x) { const v={id:'lead1',...x}; leads.set(v.id,v); return v; },
    async getSalesLead(id) { return leads.get(id); },
    async createSalesOpportunity(x) { const v={id:'opp1',...x}; opportunities.set(v.id,v); return v; },
    async getSalesOpportunity(id) { return opportunities.get(id); },
    async createSalesOffer(x) { return x; },
    async createApprovalRequest(x) { return {id:'approval1',...x}; },
    async recordSalesConversion(x) { return {id:'conversion1',...x}; }
  };
  const executionEngine = { async execute({agentId}) {
    if (agentId === 'sales-qualification-ai') return {status:'completed',output:{score:82,fit:'high',needs:['automation'],nextBestAction:'product_match'}};
    if (agentId === 'sales-opportunity-ai') return {status:'completed',output:{recommendedProductId:'pilot',confidence:.9,reason:'fit'}};
    return {status:'completed',output:{action:'educational_followup',confidence:.8}};
  }};
  const allowPolicy = { async evaluate(){ return {decision:'allow'}; } };
  const engine = new RevenueGrowthSalesEngine({store,executionEngine,policyEngine:allowPolicy});
  const lead = await engine.qualify({lead:{source:'website',company:'Example'}});
  assert.equal(lead.qualification.score,82);
  const opp = await engine.createOpportunity({leadId:lead.id,productCandidates:[{id:'pilot'}]});
  assert.equal(opp.productId,'pilot');
  const offer = await engine.proposeOffer({opportunityId:opp.id,price:199,discountPct:10});
  assert.equal(offer.status,'ready');
  assert.equal(offer.offer.finalPrice,179.1);

  const guarded = new RevenueGrowthSalesEngine({store,executionEngine,policyEngine:{async evaluate(){return {decision:'require_approval',reason:'large discount'};}}});
  const highDiscount = await guarded.proposeOffer({opportunityId:opp.id,price:199,discountPct:25,context:{environment:'production'}});
  assert.equal(highDiscount.status,'awaiting_approval');
  assert.equal(highDiscount.approval.id,'approval1');

  const conversion = await engine.recordConversion({opportunityId:opp.id,orderId:'order1',revenue:199,grossProfit:170});
  assert.equal(conversion.orderId,'order1');
  console.log('revenue_growth_sales_engine.test.js passed');
})().catch(error=>{console.error(error);process.exit(1);});

const assert = require('assert');
const { AutonomousMarketingGrowthEngine, calculateGrowthMetrics, evaluateOptimization } = require('../src/autonomous_marketing_growth');

(async () => {
  const campaigns = new Map();
  const store = {
    async createMarketingCampaign(x) { campaigns.set(x.id, x); return x; },
    async getMarketingCampaign(id) { return campaigns.get(id); },
    async createMarketingAsset(x) { return { id: 'asset1', ...x }; },
    async recordMarketingAttribution(x) { return { id: 'attr1', ...x }; },
    async createApprovalRequest(x) { return { id: 'approval1', ...x }; }
  };
  const executionEngine = { async execute({ agentId }) {
    if (agentId === 'growth-strategy-ai') return { status: 'completed', output: { campaignName: 'Pilot Growth', positioning: 'Evidence-first AI operations', channelPlan: ['seo'], expectedMetrics: {} } };
    return { status: 'completed', output: { headline: 'Improve AI Operations', body: 'Evidence-based workflow assessment', cta: 'View Pilot', claimsUsed: [] } };
  }};
  const policyEngine = { async evaluate({ risk }) { return risk === 'high' ? { decision: 'require_approval', reason: 'large spend' } : { decision: 'allow' }; } };
  let salesHandoff = false;
  const salesEngine = { async qualify({ lead }) { salesHandoff = true; return { id: 'lead1', ...lead }; } };
  const engine = new AutonomousMarketingGrowthEngine({ store, executionEngine, policyEngine, salesEngine });

  const campaign = await engine.planCampaign({ brief: { goal: 'sell pilot' }, audience: { segment: 'SMB' }, channels: ['seo'], budget: 500, productId: 'pilot' });
  assert.ok(campaign.id);
  const asset = await engine.generateCreative({ campaignId: campaign.id, format: 'landing-page' });
  assert.equal(asset.content.headline, 'Improve AI Operations');

  const metrics = calculateGrowthMetrics({ spend: 500, visits: 1000, leads: 50, customers: 10, revenue: 1990, grossProfit: 1500 });
  assert.equal(metrics.cac, 50);
  assert.ok(metrics.roas > 3);
  const decision = evaluateOptimization({ metrics, customers: 10 }, { maxCac: 100, minRoas: 2 });
  assert.equal(decision.action, 'scale');

  const spend = await engine.approveSpend({ campaignId: campaign.id, requestedSpend: 1500, context: { environment: 'production' } });
  assert.equal(spend.status, 'awaiting_approval');
  assert.equal(spend.approval.id, 'approval1');

  await engine.handoffLead({ lead: { emailHash: 'hash' } });
  assert.equal(salesHandoff, true);
  console.log('autonomous_marketing_growth.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

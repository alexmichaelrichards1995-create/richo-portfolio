const SECTION_REGISTRY = Object.freeze({
  commerce: {
    id: 'commerce',
    name: 'Commerce & Memberships',
    ownerAgent: 'commerce-agent',
    mode: 'auto_with_guardrails',
    triggers: ['shopify.order.created','shopify.product.updated','membership.changed','payment.failed'],
    capabilities: ['read:products','read:orders','read:memberships','propose:discount','propose:entitlement','sync:catalog'],
    approvalRequiredFor: ['publish:product','change:price','issue:refund','disable:membership'],
    healthChecks: ['catalog-sync','membership-projection','payment-state','entitlement-integrity']
  },
  product: {
    id: 'product',
    name: 'Product Engineering',
    ownerAgent: 'product-engineer-agent',
    mode: 'auto_with_guardrails',
    triggers: ['product.issue.detected','release.requested','dependency.changed','quality.regression'],
    capabilities: ['read:repo','propose:code','run:tests','build:release-candidate','update:documentation'],
    approvalRequiredFor: ['merge:protected-branch','deploy:production','change:customer-contract'],
    healthChecks: ['tests','release-readiness','dependency-health','documentation-freshness']
  },
  quality: {
    id: 'quality',
    name: 'Quality & Evidence',
    ownerAgent: 'qa-evidence-agent',
    mode: 'autonomous_observer',
    triggers: ['build.completed','workflow.completed','evidence.required','regression.suspected'],
    capabilities: ['run:tests','verify:evidence','score:readiness','open:defect','block:release-candidate'],
    approvalRequiredFor: [],
    healthChecks: ['test-pass-rate','evidence-completeness','open-critical-defects']
  },
  sales: {
    id: 'sales',
    name: 'Sales Intelligence',
    ownerAgent: 'sales-intelligence-agent',
    mode: 'auto_with_guardrails',
    triggers: ['lead.created','checkout.abandoned','customer.qualified','renewal.upcoming'],
    capabilities: ['read:crm','score:lead','propose:offer','draft:follow-up','analyze:conversion'],
    approvalRequiredFor: ['send:external-message','change:contract','change:price'],
    healthChecks: ['pipeline-freshness','conversion-rate','follow-up-latency']
  },
  marketing: {
    id: 'marketing',
    name: 'Marketing & Growth',
    ownerAgent: 'growth-agent',
    mode: 'auto_with_guardrails',
    triggers: ['campaign.requested','content.performance.changed','product.launched'],
    capabilities: ['analyze:performance','generate:campaign','generate:content','propose:experiment'],
    approvalRequiredFor: ['publish:public-content','spend:advertising-budget'],
    healthChecks: ['campaign-roi','content-freshness','experiment-backlog']
  },
  support: {
    id: 'support',
    name: 'Customer Support',
    ownerAgent: 'support-agent',
    mode: 'auto_with_guardrails',
    triggers: ['support.requested','membership.access.failed','entitlement.denied'],
    capabilities: ['read:customer','read:entitlement','classify:issue','draft:response','propose:remediation'],
    approvalRequiredFor: ['send:external-message','issue:refund','grant:exception'],
    healthChecks: ['unresolved-queue','first-response-latency','repeat-incident-rate']
  },
  security: {
    id: 'security',
    name: 'Security & Risk',
    ownerAgent: 'security-agent',
    mode: 'autonomous_observer',
    triggers: ['security.signal','dependency.vulnerability','permission.changed','credential.expiry'],
    capabilities: ['scan:security','score:risk','block:operation','open:incident','recommend:remediation'],
    approvalRequiredFor: ['rotate:production-secret','disable:production-integration'],
    healthChecks: ['critical-findings','secret-age','permission-drift','integration-risk']
  },
  operations: {
    id: 'operations',
    name: 'Operations & Reliability',
    ownerAgent: 'operations-agent',
    mode: 'auto_with_guardrails',
    triggers: ['integration.failed','slo.breached','reconciliation.diff','job.dead-lettered'],
    capabilities: ['retry:job','reconcile:state','open:incident','degrade:noncritical-feature','collect:telemetry'],
    approvalRequiredFor: ['disable:production-system','destructive:recovery'],
    healthChecks: ['slo-compliance','dead-letter-depth','integration-health','reconciliation-drift']
  }
});

function getSection(sectionId) {
  return SECTION_REGISTRY[sectionId] || null;
}

function listSections() {
  return Object.values(SECTION_REGISTRY);
}

module.exports = { SECTION_REGISTRY, getSection, listSections };

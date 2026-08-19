'use strict';

const DEFAULT_CRITICAL_OPERATIONS = new Set([
  'credential.rotate',
  'customer.data.delete',
  'deployment.production',
  'financial.commit',
  'legal.publish',
  'payment.refund.large',
  'product.public_release',
  'security.disable',
  'system.destructive_change'
]);

const RISK_WEIGHT = { low: 1, medium: 2, high: 3, critical: 4 };

function evaluatePolicy(context, policy = {}) {
  const actor = context.actor || {};
  const operation = context.operation;
  const environment = context.environment || 'production';
  const risk = context.risk || 'medium';
  const dataClass = context.dataClass || 'internal';
  const capabilities = new Set(actor.capabilities || []);
  const requiredCapability = policy.requiredCapability || operation;
  const criticalOperations = new Set([...(policy.criticalOperations || []), ...DEFAULT_CRITICAL_OPERATIONS]);

  const reasons = [];
  let decision = 'allow';
  let approvalRequired = false;

  if (!operation) return { decision: 'deny', approvalRequired: false, reasons: ['missing operation'] };

  if (!capabilities.has(requiredCapability) && !capabilities.has('*')) {
    decision = 'deny';
    reasons.push(`actor lacks capability: ${requiredCapability}`);
  }

  if (environment === 'production' && actor.type === 'ai' && RISK_WEIGHT[risk] >= RISK_WEIGHT.high) {
    approvalRequired = true;
    reasons.push('high-risk production AI action requires named-human approval');
  }

  if (criticalOperations.has(operation)) {
    approvalRequired = true;
    reasons.push('operation is owner-sovereignty gated');
  }

  if (['restricted', 'secret'].includes(dataClass) && actor.type === 'ai' && !capabilities.has('data.restricted')) {
    decision = 'deny';
    reasons.push('AI actor lacks restricted-data capability');
  }

  if (policy.denyProductionAI === true && environment === 'production' && actor.type === 'ai') {
    decision = 'deny';
    reasons.push('policy denies AI execution in production');
  }

  if (decision !== 'deny' && approvalRequired && !context.approval?.approved) {
    decision = 'require_approval';
  }

  if (decision !== 'deny' && approvalRequired && context.approval?.approved) {
    if (!context.approval.approvedBy || context.approval.approverType !== 'human') {
      decision = 'deny';
      reasons.push('approval must identify a human approver');
    }
  }

  return {
    decision,
    approvalRequired,
    operation,
    environment,
    risk,
    dataClass,
    actorId: actor.id || null,
    reasons
  };
}

function assertAllowed(context, policy) {
  const result = evaluatePolicy(context, policy);
  if (result.decision !== 'allow') {
    const error = new Error(`policy decision: ${result.decision}; ${result.reasons.join('; ')}`);
    error.code = 'RICHO_POLICY_BLOCK';
    error.policyDecision = result;
    throw error;
  }
  return result;
}

module.exports = { evaluatePolicy, assertAllowed, DEFAULT_CRITICAL_OPERATIONS };

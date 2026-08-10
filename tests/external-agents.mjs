import assert from 'node:assert/strict';
import { EXTERNAL_AGENT_REGISTRY, getExternalAgent, listExternalAgents, canAgentPerform } from '../runtime/external-agents.registry.mjs';

const ascn = getExternalAgent('ASCN-001');
assert.ok(ascn, 'ASCN agent must be registered');
assert.equal(ascn.workspaceUrl, 'https://ascn.ai/agents/ws-SN7By9jNTdx5xpTVxWBScR');
assert.equal(ascn.status, 'REGISTERED_UNVERIFIED_WORKSPACE');
assert.equal(ascn.governance.humanFinalAuthority, true);
assert.equal(ascn.governance.leastPrivilege, true);
assert.equal(ascn.verification.permissionScopesVerified, false);
assert.equal(canAgentPerform('ASCN-001', 'readPublicData'), true);
for (const action of ['readPrivateData','writeInternalRecords','sendExternalMessages','publish','deploy','spendOrRefund','contractOrAcceptTerms','changeSecurityOrPermissions','deleteData']) {
  assert.equal(canAgentPerform('ASCN-001', action), false, `${action} must remain blocked until explicitly verified/approved`);
}
assert.equal(listExternalAgents().length, Object.keys(EXTERNAL_AGENT_REGISTRY).length);
console.log('External agent registry validation PASSED');

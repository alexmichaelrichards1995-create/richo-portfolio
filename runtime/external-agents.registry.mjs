export const EXTERNAL_AGENT_REGISTRY = Object.freeze({
  'ASCN-001': Object.freeze({
    id: 'ASCN-001',
    provider: 'ASCN.AI',
    type: 'external-agent-workspace',
    name: 'ASCN Agent Workspace',
    workspaceUrl: 'https://ascn.ai/agents/ws-SN7By9jNTdx5xpTVxWBScR',
    status: 'REGISTERED_UNVERIFIED_WORKSPACE',
    purpose: 'Parallel R.I.C.H.O. automation and agent collaboration endpoint.',
    platformCapabilities: Object.freeze([
      'scheduled-agent-workflows',
      'event-driven-automation',
      'github-integration',
      'google-drive-integration',
      'gmail-integration',
      'slack-integration',
      'notion-integration',
      'api-and-mcp-integrations'
    ]),
    authority: Object.freeze({
      readPublicData: true,
      readPrivateData: false,
      writeInternalRecords: false,
      sendExternalMessages: false,
      publish: false,
      deploy: false,
      spendOrRefund: false,
      contractOrAcceptTerms: false,
      changeSecurityOrPermissions: false,
      deleteData: false
    }),
    governance: Object.freeze({
      ownerApprovalRequiredForConsequentialActions: true,
      leastPrivilege: true,
      evidenceRequiredForClaims: true,
      humanFinalAuthority: true,
      secretsMustNotBeStoredInRegistry: true
    }),
    verification: Object.freeze({
      workspaceReachabilityVerified: false,
      accountOwnershipVerified: false,
      connectedServicesVerified: false,
      permissionScopesVerified: false,
      lastVerifiedAt: null
    })
  })
});

export function getExternalAgent(id) {
  return EXTERNAL_AGENT_REGISTRY[id] || null;
}

export function listExternalAgents() {
  return Object.values(EXTERNAL_AGENT_REGISTRY);
}

export function canAgentPerform(id, action) {
  const agent = getExternalAgent(id);
  if (!agent) return false;
  return agent.authority[action] === true;
}

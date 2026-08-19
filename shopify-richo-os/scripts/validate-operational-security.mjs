import fs from "node:fs";

const checks = {
  "prisma/schema.prisma": [
    "model RichoShopOperator",
    "model RichoMutationWindow",
    "model RichoShopControl",
    "model RichoWebhookReceipt",
    "model RichoSecurityEvent",
    "@@unique([shopDomain, sessionId])",
    "@@unique([shopDomain, actorId, windowStart])",
  ],
  "app/lib/operational-security.server.ts": [
    "bootstrapAccountOwnerOperator",
    "consumeMutationQuota",
    "MUTATION_RATE_LIMIT_EXCEEDED",
    "Mutation rate limit exceeded",
    "revokeShopSessions",
    "SESSIONS_REVOKED",
    "getInstallationQualification",
    "separatedApprovalExecution",
  ],
  "app/lib/operator-store.server.ts": [
    "canApprove",
    "canExecute",
    "canRollback",
    "canAdminister",
    "Operator lacks",
  ],
  "app/lib/admin-request-guard.server.ts": ["assertTrustedAdminPost", "Untrusted admin action origin", "Cross-site admin action blocked"],
  "app/lib/security-events.server.ts": ["recordSecurityEvent", "listSecurityEvents"],
  "app/lib/shopify-product-executor.server.ts": ["consumeMutationQuota", "SEPARATION_OF_DUTIES_BLOCKED", "APPROVER_CANNOT_EXECUTE_SAME_ACTION"],
  "app/routes/app._index.tsx": ["assertTrustedAdminPost", "actorId: session.id"],
  "app/routes/app.security.tsx": [
    "assertTrustedAdminPost",
    "Installation Qualification",
    "Approve Deployment",
    "Save Operator",
    "Revoke All Sessions",
    "Security Event Ledger",
    "OPERATOR_CHANGED",
    "DEPLOYMENT_APPROVED",
  ],
  "app/routes/webhooks.app.uninstalled.tsx": ["registerWebhookReceipt", "BLOCKED", "X-RICHO-Correlation-Id"],
  "app/routes/webhooks.app.scopes_update.tsx": ["registerWebhookReceipt", "lastScopeSyncAt", "X-RICHO-Correlation-Id"],
};

for (const [path, needles] of Object.entries(checks)) {
  const text = fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${path} missing operational-security invariant: ${needle}`);
  }
}

console.log("RICHO Shopify operational-security invariants validated.");

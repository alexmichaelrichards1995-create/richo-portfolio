import fs from "node:fs";

const checks = {
  "prisma/schema.prisma": [
    "model RichoShopOperator",
    "model RichoMutationWindow",
    "model RichoShopControl",
    "model RichoWebhookReceipt",
    "@@unique([shopDomain, sessionId])",
    "@@unique([shopDomain, actorId, windowStart])",
  ],
  "app/lib/operational-security.server.ts": [
    "bootstrapAccountOwnerOperator",
    "consumeMutationQuota",
    "RICHO_INVALID_MUTATION_LIMIT",
    "Mutation rate limit exceeded",
    "revokeShopSessions",
    "getInstallationQualification",
  ],
  "app/lib/operator-store.server.ts": [
    "canApprove",
    "canExecute",
    "canRollback",
    "canAdminister",
    "Operator lacks",
  ],
  "app/lib/shopify-product-executor.server.ts": ["consumeMutationQuota"],
  "app/routes/app.security.tsx": [
    "Installation Qualification",
    "Approve Deployment",
    "Save Operator",
    "Revoke All Sessions",
    "Security Events",
  ],
  "app/routes/webhooks.app.uninstalled.tsx": ["claimWebhookReceipt", "BLOCKED"],
  "app/routes/webhooks.app.scopes_update.tsx": ["claimWebhookReceipt", "lastScopeSyncAt"],
};

for (const [path, needles] of Object.entries(checks)) {
  const text = fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${path} missing operational-security invariant: ${needle}`);
  }
}

console.log("RICHO Shopify operational-security invariants validated.");

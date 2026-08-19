export type RichoEntitlement = {
  sku: string;
  family: "membership" | "workflow" | "qa" | "operations" | "service";
  tier: "starter" | "pro" | "operator" | "standalone" | "pilot";
  access: string[];
};

const ENTITLEMENTS: Record<string, RichoEntitlement> = {
  "RICHO-MEM-STARTER": {
    sku: "RICHO-MEM-STARTER",
    family: "membership",
    tier: "starter",
    access: ["member_portal", "starter_library", "starter_updates"],
  },
  "RICHO-MEM-PRO": {
    sku: "RICHO-MEM-PRO",
    family: "membership",
    tier: "pro",
    access: [
      "member_portal",
      "starter_library",
      "pro_library",
      "operations_templates",
      "priority_updates",
    ],
  },
  "RICHO-MEM-OPERATOR": {
    sku: "RICHO-MEM-OPERATOR",
    family: "membership",
    tier: "operator",
    access: [
      "member_portal",
      "complete_library",
      "operations_templates",
      "workflow_templates_monthly",
      "priority_support",
      "beta_access",
      "live_qa",
      "pilot_priority",
    ],
  },
  "RICHO-WF-STARTER-49": {
    sku: "RICHO-WF-STARTER-49",
    family: "workflow",
    tier: "standalone",
    access: ["workflow_starter_pack"],
  },
  "RICHO-WF-PRO-99": {
    sku: "RICHO-WF-PRO-99",
    family: "workflow",
    tier: "standalone",
    access: ["workflow_pro_pack"],
  },
  "RICHO-AI-QA-79": {
    sku: "RICHO-AI-QA-79",
    family: "qa",
    tier: "standalone",
    access: ["ai_review_qa_toolkit"],
  },
  "RICHO-OPS-BUNDLE-129": {
    sku: "RICHO-OPS-BUNDLE-129",
    family: "operations",
    tier: "standalone",
    access: ["operations_template_bundle"],
  },
  "RICHO-PILOT-199": {
    sku: "RICHO-PILOT-199",
    family: "service",
    tier: "pilot",
    access: ["pilot_onboarding", "workflow_assessment", "action_plan"],
  },
};

export function entitlementForSku(sku?: string | null): RichoEntitlement | null {
  if (!sku) return null;
  return ENTITLEMENTS[sku.trim().toUpperCase()] ?? null;
}

export function knownRichoSkus(): string[] {
  return Object.keys(ENTITLEMENTS);
}

export function planEntitlements(
  lineItems: Array<{ id?: string; sku?: string | null; quantity?: number | null }>,
) {
  return lineItems.flatMap((line) => {
    const entitlement = entitlementForSku(line.sku);
    if (!entitlement) return [];

    return [{
      sourceLineItemId: line.id ?? null,
      quantity: Math.max(1, Number(line.quantity ?? 1)),
      ...entitlement,
    }];
  });
}

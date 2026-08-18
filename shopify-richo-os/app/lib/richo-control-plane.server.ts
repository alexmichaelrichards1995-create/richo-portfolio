import type { RichoFinding } from "./richo-engine.server";

export type AgentId = "conversion" | "catalog" | "revenue" | "customer" | "governance";
export type Risk = "low" | "medium" | "high" | "critical";
export type ApprovalStatus = "proposed" | "approved" | "rejected" | "executed" | "failed";

export type ProposedAction = {
  id: string;
  agent: AgentId;
  title: string;
  evidence: string;
  recommendation: string;
  risk: Risk;
  reversible: boolean;
  requiresHumanApproval: true;
  status: ApprovalStatus;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  actionId: string;
  event: "PROPOSED" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED";
  actor: "system" | "human";
  at: string;
  evidence?: string;
};

const agentFor = (finding: RichoFinding): AgentId => {
  if (finding.domain === "conversion") return "conversion";
  if (finding.domain === "catalog") return "catalog";
  if (finding.domain === "sales") return "revenue";
  if (finding.domain === "customer") return "customer";
  return "governance";
};

const riskFor = (finding: RichoFinding): Risk => {
  if (finding.severity === "critical") return "critical";
  if (finding.severity === "action") return "high";
  if (finding.severity === "watch") return "medium";
  return "low";
};

export function proposeActions(findings: RichoFinding[], now = new Date()): ProposedAction[] {
  return findings.map((finding) => ({
    id: `action:${finding.id}`,
    agent: agentFor(finding),
    title: finding.title,
    evidence: finding.evidence,
    recommendation: finding.recommendation,
    risk: riskFor(finding),
    reversible: finding.domain !== "governance",
    requiresHumanApproval: true,
    status: "proposed",
    createdAt: now.toISOString(),
  }));
}

export function initialAuditLedger(actions: ProposedAction[]): AuditEvent[] {
  return actions.map((action) => ({
    id: `audit:${action.id}:proposed`,
    actionId: action.id,
    event: "PROPOSED",
    actor: "system",
    at: action.createdAt,
    evidence: action.evidence,
  }));
}

// Deliberately no Shopify mutation executor here. Execution is a separate adapter
// that must verify persisted approval, current state, idempotency and rollback data.

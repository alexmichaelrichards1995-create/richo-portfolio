import type { ProposedAction } from "./richo-control-plane.server";

export type ExecutionContext = {
  action: ProposedAction;
  persistedStatus: "proposed" | "approved" | "rejected" | "executed" | "failed";
  expectedStateMatches: boolean;
  idempotencyKey: string | null;
  alreadyExecuted: boolean;
  rollbackPayload: unknown | null;
};

export type GateDecision = {
  allowed: boolean;
  blockers: string[];
};

export function evaluateExecutionGate(ctx: ExecutionContext): GateDecision {
  const blockers: string[] = [];

  if (ctx.action.requiresHumanApproval && ctx.persistedStatus !== "approved") {
    blockers.push("Persisted human approval is required.");
  }
  if (!ctx.expectedStateMatches) {
    blockers.push("Shopify state changed after the proposal; refresh evidence before execution.");
  }
  if (!ctx.idempotencyKey) {
    blockers.push("An idempotency key is required.");
  }
  if (ctx.alreadyExecuted) {
    blockers.push("This action has already been executed.");
  }
  if (ctx.action.reversible && ctx.rollbackPayload == null) {
    blockers.push("A rollback payload is required for reversible mutations.");
  }
  if (ctx.action.risk === "critical") {
    blockers.push("Critical-risk actions require a separate owner-authorised execution policy.");
  }

  return { allowed: blockers.length === 0, blockers };
}

export function assertExecutionAllowed(ctx: ExecutionContext) {
  const decision = evaluateExecutionGate(ctx);
  if (!decision.allowed) {
    throw new Error(`RICHO_EXECUTION_BLOCKED: ${decision.blockers.join(" ")}`);
  }
  return true;
}

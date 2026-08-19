import { describe, expect, it } from "vitest";
import { evaluateExecutionGate } from "./execution-gate.server";

const baseAction = {
  id: "action:test",
  agent: "catalog" as const,
  title: "Test",
  evidence: "Evidence",
  recommendation: "Recommendation",
  risk: "low" as const,
  reversible: true,
  requiresHumanApproval: true as const,
  status: "approved" as const,
  createdAt: new Date(0).toISOString(),
};

const base = {
  action: baseAction,
  persistedStatus: "approved" as const,
  expectedStateMatches: true,
  idempotencyKey: "key",
  alreadyExecuted: false,
  rollbackPayload: { ok: true },
};

describe("execution gate", () => {
  it("allows a valid approved reversible action", () => {
    expect(evaluateExecutionGate(base)).toEqual({ allowed: true, blockers: [] });
  });

  it.each([
    ["unapproved", { persistedStatus: "proposed" as const }, "Persisted human approval"],
    ["stale state", { expectedStateMatches: false }, "Shopify state changed"],
    ["missing idempotency", { idempotencyKey: null }, "idempotency key"],
    ["duplicate execution", { alreadyExecuted: true }, "already been executed"],
    ["missing rollback", { rollbackPayload: null }, "rollback payload"],
  ])("blocks %s", (_name, patch, expected) => {
    const result = evaluateExecutionGate({ ...base, ...patch });
    expect(result.allowed).toBe(false);
    expect(result.blockers.join(" ")).toContain(expected);
  });

  it("blocks critical-risk actions even when otherwise valid", () => {
    const result = evaluateExecutionGate({ ...base, action: { ...baseAction, risk: "critical" } });
    expect(result.allowed).toBe(false);
    expect(result.blockers.join(" ")).toContain("Critical-risk");
  });
});

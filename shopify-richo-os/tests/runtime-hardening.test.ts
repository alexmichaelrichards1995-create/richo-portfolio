import { describe, expect, it } from "vitest";
import { deploymentState } from "../app/lib/deployment-gate.server";
import { operatorCapabilities, requireOperatorCapability } from "../app/lib/operator-policy.server";

const baseEnv = {
  NODE_ENV: "production",
  SHOPIFY_API_KEY: "key",
  SHOPIFY_API_SECRET: "secret",
  SHOPIFY_APP_URL: "https://app.example.com",
  DATABASE_URL: "postgresql://x:y@localhost:5432/db",
  SCOPES: "read_products,write_products,read_reports",
  RICHO_PRODUCTION_APPROVED: "true",
};

describe("deployment gate", () => {
  it("blocks when readiness is incomplete", () => {
    expect(deploymentState({} as NodeJS.ProcessEnv).state).toBe("BLOCKED");
  });

  it("qualifies but does not approve without explicit deployment approval", () => {
    expect(deploymentState(baseEnv as NodeJS.ProcessEnv).state).toBe("QUALIFIED");
  });

  it("approves only with explicit deployment approval", () => {
    expect(deploymentState({ ...baseEnv, RICHO_DEPLOYMENT_APPROVED: "true" } as NodeJS.ProcessEnv).state).toBe("APPROVED");
  });
});

describe("operator policy", () => {
  const env = {
    NODE_ENV: "production",
    RICHO_APPROVER_SESSION_IDS: "owner,reviewer",
    RICHO_EXECUTOR_SESSION_IDS: "owner,executor",
    RICHO_ROLLBACK_SESSION_IDS: "owner,rollback",
  } as NodeJS.ProcessEnv;

  it("assigns capabilities independently", () => {
    expect([...operatorCapabilities("reviewer", env)]).toEqual(["approve"]);
    expect([...operatorCapabilities("executor", env)]).toEqual(["execute"]);
    expect([...operatorCapabilities("rollback", env)]).toEqual(["rollback"]);
    expect(operatorCapabilities("owner", env).size).toBe(3);
  });

  it("rejects missing production capability", () => {
    expect(() => requireOperatorCapability("reviewer", "execute", env)).toThrow();
  });

  it("permits assigned production capability", () => {
    expect(() => requireOperatorCapability("reviewer", "approve", env)).not.toThrow();
  });

  it("can enforce policy outside production for qualification testing", () => {
    const strictDev = { NODE_ENV: "development", RICHO_ENFORCE_OPERATOR_POLICY: "true" } as NodeJS.ProcessEnv;
    expect(() => requireOperatorCapability("none", "approve", strictDev)).toThrow();
  });
});

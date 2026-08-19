import { describe, expect, it } from "vitest";
import { evaluateProductionReadiness } from "./production-readiness.server";

const valid = {
  NODE_ENV: "production",
  SHOPIFY_API_KEY: "key",
  SHOPIFY_API_SECRET: "secret",
  SHOPIFY_APP_URL: "https://richo.example.com",
  DATABASE_URL: "postgresql://example",
  SCOPES: "read_products,write_products,read_reports,read_orders,read_customers",
  RICHO_PRODUCTION_APPROVED: "true",
};

describe("production readiness", () => {
  it("qualifies a complete approved production environment", () => {
    expect(evaluateProductionReadiness(valid)).toEqual({ ready: true, blockers: [] });
  });

  it("reports every missing required variable", () => {
    const result = evaluateProductionReadiness({ NODE_ENV: "production" });
    expect(result.ready).toBe(false);
    for (const key of ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL", "DATABASE_URL", "SCOPES"]) {
      expect(result.blockers.join(" ")).toContain(key);
    }
  });

  it("blocks insecure and placeholder URLs", () => {
    expect(evaluateProductionReadiness({ ...valid, SHOPIFY_APP_URL: "http://example.invalid" }).ready).toBe(false);
    expect(evaluateProductionReadiness({ ...valid, SHOPIFY_APP_URL: "https://example.invalid" }).ready).toBe(false);
  });

  it("blocks missing required scopes", () => {
    const result = evaluateProductionReadiness({ ...valid, SCOPES: "read_products" });
    expect(result.ready).toBe(false);
    expect(result.blockers.join(" ")).toContain("write_products");
    expect(result.blockers.join(" ")).toContain("read_reports");
  });

  it("blocks production without explicit approval", () => {
    const result = evaluateProductionReadiness({ ...valid, RICHO_PRODUCTION_APPROVED: "false" });
    expect(result.ready).toBe(false);
    expect(result.blockers.join(" ")).toContain("RICHO_PRODUCTION_APPROVED=true");
  });
});

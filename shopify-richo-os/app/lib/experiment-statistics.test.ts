import { describe, expect, it } from "vitest";
import { compareExperimentStatistically } from "./experiment-statistics.server";

const m = (sessions:number,purchases:number,revenue=0) => ({ sessions, addToCarts:0, checkouts:0, purchases, orders:purchases, revenue });

describe("experiment statistics", () => {
  it("marks tiny samples insufficient", () => {
    const result = compareExperimentStatistically(m(10,1), m(10,2));
    expect(result.significance).toBe("insufficient_data");
    expect(result.zScore).toBeNull();
  });

  it("detects a strong positive conversion shift", () => {
    const result = compareExperimentStatistically(m(1000,20), m(1000,50));
    expect(result.absoluteLift).toBeGreaterThan(0);
    expect(result.zScore).not.toBeNull();
    expect(result.significance).toBe("strong");
  });

  it("detects a strong negative conversion shift", () => {
    const result = compareExperimentStatistically(m(1000,50), m(1000,20));
    expect(result.absoluteLift).toBeLessThan(0);
    expect(result.significance).toBe("strong");
  });

  it("returns null relative lift when baseline conversion is zero", () => {
    const result = compareExperimentStatistically(m(100,0), m(100,2));
    expect(result.relativeLift).toBeNull();
  });

  it("keeps identical cohorts at zero lift", () => {
    const result = compareExperimentStatistically(m(500,10), m(500,10));
    expect(result.absoluteLift).toBe(0);
    expect(result.significance).toBe("insufficient_data");
  });
});

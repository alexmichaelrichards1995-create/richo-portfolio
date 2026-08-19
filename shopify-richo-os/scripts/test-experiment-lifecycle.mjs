import assert from "node:assert/strict";

function confidenceFor(baseline, outcome) {
  const exposure = Math.min(baseline.sessions, outcome.sessions);
  const purchases = baseline.purchases + outcome.purchases;
  if (exposure >= 250 && purchases >= 10) return "high";
  if (exposure >= 75 && purchases >= 3) return "medium";
  return "low";
}

function classifyImpact(baseline, outcome) {
  if (baseline.sessions < 20 || outcome.sessions < 20) return "insufficient_data";
  const rate = (n, d) => d > 0 ? n / d : 0;
  const conversionDelta = rate(outcome.purchases, outcome.sessions) - rate(baseline.purchases, baseline.sessions);
  const revenuePerSessionDelta = rate(outcome.revenue, outcome.sessions) - rate(baseline.revenue, baseline.sessions);
  if (conversionDelta >= 0.0025 || revenuePerSessionDelta >= 0.5) return "improved";
  if (conversionDelta <= -0.0025 || revenuePerSessionDelta <= -0.5) return "regressed";
  return "neutral";
}

function recommendationFor(impact, confidence) {
  if (impact === "insufficient_data") return "collect_more_data";
  if (impact === "regressed" && confidence !== "low") return "rollback";
  if (impact === "improved" && confidence !== "low") return "retain";
  return "observe";
}

class MockExperimentStore {
  experiments = [];
  audit = [];
  start({ actionId, productId, baseline }) {
    const collision = this.experiments.find((e) => e.productId === productId && e.status === "running" && e.actionId !== actionId);
    if (collision) throw new Error(`RICHO_EXPERIMENT_COLLISION:${collision.actionId}`);
    const existing = this.experiments.find((e) => e.actionId === actionId);
    if (existing) return existing;
    const row = { actionId, productId, baseline, outcome: null, status: "running" };
    this.experiments.push(row);
    return row;
  }
  measure(actionId, outcome) {
    const row = this.experiments.find((e) => e.actionId === actionId && e.status === "running");
    assert.ok(row, "running experiment must exist");
    row.outcome = outcome;
    row.status = "measured";
    const impact = classifyImpact(row.baseline, outcome);
    const confidence = confidenceFor(row.baseline, outcome);
    const recommendation = recommendationFor(impact, confidence);
    this.audit.push({ actionId, event: "EXPERIMENT_MEASURED", impact, confidence, recommendation });
    if (recommendation === "rollback") this.audit.push({ actionId, event: "ROLLBACK_RECOMMENDED" });
    return { impact, confidence, recommendation };
  }
}

const goodBase = { sessions: 300, addToCarts: 30, checkouts: 18, purchases: 12, orders: 12, revenue: 2400 };
const improved = { sessions: 310, addToCarts: 42, checkouts: 27, purchases: 20, orders: 20, revenue: 3900 };
const regressed = { sessions: 300, addToCarts: 17, checkouts: 8, purchases: 4, orders: 4, revenue: 700 };

const store = new MockExperimentStore();
store.start({ actionId: "a1", productId: "p1", baseline: goodBase });
assert.throws(() => store.start({ actionId: "a2", productId: "p1", baseline: goodBase }), /RICHO_EXPERIMENT_COLLISION/);

const result1 = store.measure("a1", improved);
assert.equal(result1.impact, "improved");
assert.equal(result1.confidence, "high");
assert.equal(result1.recommendation, "retain");
assert.equal(store.audit.at(-1).event, "EXPERIMENT_MEASURED");

store.start({ actionId: "a3", productId: "p1", baseline: goodBase });
const result2 = store.measure("a3", regressed);
assert.equal(result2.impact, "regressed");
assert.equal(result2.confidence, "high");
assert.equal(result2.recommendation, "rollback");
assert.equal(store.audit.at(-1).event, "ROLLBACK_RECOMMENDED");

const lowBase = { sessions: 10, addToCarts: 1, checkouts: 1, purchases: 0, orders: 0, revenue: 0 };
store.start({ actionId: "a4", productId: "p2", baseline: lowBase });
const low = store.measure("a4", lowBase);
assert.equal(low.impact, "insufficient_data");
assert.equal(low.recommendation, "collect_more_data");

console.log("RICHO experiment lifecycle tests passed.");

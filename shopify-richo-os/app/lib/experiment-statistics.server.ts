import type { ExperimentMetrics } from "./experiment-ledger.server";

export type StatisticalResult = {
  baselineConversion: number;
  outcomeConversion: number;
  absoluteLift: number;
  relativeLift: number | null;
  zScore: number | null;
  significance: "insufficient_data" | "directional" | "strong";
};

function conversion(m: ExperimentMetrics) {
  return m.sessions > 0 ? m.purchases / m.sessions : 0;
}

export function compareExperimentStatistically(baseline: ExperimentMetrics, outcome: ExperimentMetrics): StatisticalResult {
  const p1 = conversion(baseline);
  const p2 = conversion(outcome);
  const lift = p2 - p1;
  const relativeLift = p1 > 0 ? lift / p1 : null;
  const n1 = baseline.sessions;
  const n2 = outcome.sessions;

  if (n1 < 20 || n2 < 20) {
    return { baselineConversion: p1, outcomeConversion: p2, absoluteLift: lift, relativeLift, zScore: null, significance: "insufficient_data" };
  }

  const pooled = (baseline.purchases + outcome.purchases) / (n1 + n2);
  const variance = pooled * (1 - pooled) * (1 / n1 + 1 / n2);
  const zScore = variance > 0 ? lift / Math.sqrt(variance) : null;
  const absZ = Math.abs(zScore ?? 0);
  const significance = absZ >= 1.96 ? "strong" : absZ >= 1 ? "directional" : "insufficient_data";

  return { baselineConversion: p1, outcomeConversion: p2, absoluteLift: lift, relativeLift, zScore, significance };
}

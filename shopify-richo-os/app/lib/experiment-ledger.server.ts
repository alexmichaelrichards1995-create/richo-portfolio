import prisma from "../db.server";

export type ExperimentMetrics = {
  sessions: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  orders: number;
  revenue: number;
};

export type ExperimentImpact = "improved" | "neutral" | "regressed" | "insufficient_data";
export type ExperimentConfidence = "low" | "medium" | "high";
export type ExperimentRecommendation = "retain" | "observe" | "rollback" | "collect_more_data";

const rate = (n: number, d: number) => d > 0 ? n / d : 0;

export function confidenceFor(baseline: ExperimentMetrics, outcome: ExperimentMetrics): ExperimentConfidence {
  const exposure = Math.min(baseline.sessions, outcome.sessions);
  const purchases = baseline.purchases + outcome.purchases;
  if (exposure >= 250 && purchases >= 10) return "high";
  if (exposure >= 75 && purchases >= 3) return "medium";
  return "low";
}

export function classifyImpact(baseline: ExperimentMetrics, outcome: ExperimentMetrics): ExperimentImpact {
  if (baseline.sessions < 20 || outcome.sessions < 20) return "insufficient_data";
  const baseConversion = rate(baseline.purchases, baseline.sessions);
  const outcomeConversion = rate(outcome.purchases, outcome.sessions);
  const conversionDelta = outcomeConversion - baseConversion;
  const revenuePerSessionDelta = rate(outcome.revenue, outcome.sessions) - rate(baseline.revenue, baseline.sessions);

  if (conversionDelta >= 0.0025 || revenuePerSessionDelta >= 0.5) return "improved";
  if (conversionDelta <= -0.0025 || revenuePerSessionDelta <= -0.5) return "regressed";
  return "neutral";
}

export function recommendationFor(impact: ExperimentImpact, confidence: ExperimentConfidence): ExperimentRecommendation {
  if (impact === "insufficient_data") return "collect_more_data";
  if (impact === "regressed" && confidence !== "low") return "rollback";
  if (impact === "improved" && confidence !== "low") return "retain";
  return "observe";
}

export async function startExperiment(args: { shopDomain: string; actionId: string; baseline: ExperimentMetrics; targetProductId?: string | null }) {
  if (args.targetProductId) {
    const collision = await prisma.richoShopifyExperiment.findFirst({
      where: { shopDomain: args.shopDomain, targetProductId: args.targetProductId, status: "running", NOT: { actionId: args.actionId } },
    });
    if (collision) throw new Error(`RICHO_EXPERIMENT_COLLISION:${collision.actionId}`);
  }

  return prisma.richoShopifyExperiment.upsert({
    where: { actionId: args.actionId },
    update: {},
    create: {
      id: `experiment:${args.actionId}`,
      actionId: args.actionId,
      shopDomain: args.shopDomain,
      targetProductId: args.targetProductId ?? null,
      baseline: args.baseline,
      status: "running",
    },
  });
}

export async function measureExperiment(args: { shopDomain: string; actionId: string; outcome: ExperimentMetrics }) {
  const experiment = await prisma.richoShopifyExperiment.findFirst({
    where: { actionId: args.actionId, shopDomain: args.shopDomain, status: "running" },
  });
  if (!experiment) return null;
  return prisma.richoShopifyExperiment.update({
    where: { id: experiment.id },
    data: { outcome: args.outcome, measuredAt: new Date(), status: "measured" },
  });
}

export async function listExperiments(shopDomain: string) {
  const rows = await prisma.richoShopifyExperiment.findMany({
    where: { shopDomain },
    orderBy: { startedAt: "desc" },
  });
  return rows.map((row) => {
    const baseline = row.baseline as ExperimentMetrics;
    const outcome = row.outcome as ExperimentMetrics | null;
    const impact = outcome ? classifyImpact(baseline, outcome) : null;
    const confidence = outcome ? confidenceFor(baseline, outcome) : null;
    return {
      ...row,
      baseline,
      outcome,
      impact,
      confidence,
      recommendation: impact && confidence ? recommendationFor(impact, confidence) : null,
    };
  });
}

export async function markExperimentRolledBack(args: { shopDomain: string; actionId: string }) {
  const experiment = await prisma.richoShopifyExperiment.findFirst({
    where: { actionId: args.actionId, shopDomain: args.shopDomain },
  });
  if (!experiment) return null;
  return prisma.richoShopifyExperiment.update({
    where: { id: experiment.id },
    data: { status: "rolled_back", measuredAt: new Date() },
  });
}

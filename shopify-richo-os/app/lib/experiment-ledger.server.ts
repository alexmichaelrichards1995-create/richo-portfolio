import prisma from "../db.server";

export type ExperimentMetrics = {
  sessions: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  orders: number;
  revenue: number;
};

export async function startExperiment(args: { shopDomain: string; actionId: string; baseline: ExperimentMetrics }) {
  return prisma.richoShopifyExperiment.upsert({
    where: { actionId: args.actionId },
    update: {},
    create: {
      id: `experiment:${args.actionId}`,
      actionId: args.actionId,
      shopDomain: args.shopDomain,
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

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
  return prisma.$executeRawUnsafe(
    `INSERT INTO richo_shopify_experiments (id, action_id, shop_domain, baseline)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (action_id) DO NOTHING`,
    `experiment:${args.actionId}`,
    args.actionId,
    args.shopDomain,
    JSON.stringify(args.baseline),
  );
}

export async function measureExperiment(args: { shopDomain: string; actionId: string; outcome: ExperimentMetrics }) {
  return prisma.$executeRawUnsafe(
    `UPDATE richo_shopify_experiments
     SET outcome = $1::jsonb, measured_at = now(), status = 'measured'
     WHERE action_id = $2 AND shop_domain = $3 AND status = 'running'`,
    JSON.stringify(args.outcome),
    args.actionId,
    args.shopDomain,
  );
}

export async function markExperimentRolledBack(args: { shopDomain: string; actionId: string }) {
  return prisma.$executeRawUnsafe(
    `UPDATE richo_shopify_experiments SET status = 'rolled_back', measured_at = now()
     WHERE action_id = $1 AND shop_domain = $2`,
    args.actionId,
    args.shopDomain,
  );
}

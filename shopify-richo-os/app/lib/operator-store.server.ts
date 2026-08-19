import prisma from "../db.server";

export type OperatorCapability = "approve" | "execute" | "rollback" | "administer";

export async function listOperators(shopDomain: string) {
  return prisma.richoShopOperator.findMany({ where: { shopDomain }, orderBy: { createdAt: "asc" } });
}

export async function upsertOperator(args: {
  shopDomain: string;
  sessionId: string;
  canApprove?: boolean;
  canExecute?: boolean;
  canRollback?: boolean;
  canAdminister?: boolean;
  active?: boolean;
}) {
  return prisma.richoShopOperator.upsert({
    where: { shopDomain_sessionId: { shopDomain: args.shopDomain, sessionId: args.sessionId } },
    update: {
      canApprove: args.canApprove ?? false,
      canExecute: args.canExecute ?? false,
      canRollback: args.canRollback ?? false,
      canAdminister: args.canAdminister ?? false,
      active: args.active ?? true,
    },
    create: {
      shopDomain: args.shopDomain,
      sessionId: args.sessionId,
      canApprove: args.canApprove ?? false,
      canExecute: args.canExecute ?? false,
      canRollback: args.canRollback ?? false,
      canAdminister: args.canAdminister ?? false,
      active: args.active ?? true,
    },
  });
}

export async function requireOperatorCapability(shopDomain: string, sessionId: string, capability: OperatorCapability) {
  const operator = await prisma.richoShopOperator.findUnique({
    where: { shopDomain_sessionId: { shopDomain, sessionId } },
  });
  if (!operator?.active) throw new Response("Operator is not active", { status: 403 });
  const allowed = capability === "approve" ? operator.canApprove : capability === "execute" ? operator.canExecute : capability === "rollback" ? operator.canRollback : operator.canAdminister;
  if (!allowed) throw new Response(`Operator lacks ${capability} capability`, { status: 403 });
  return operator;
}

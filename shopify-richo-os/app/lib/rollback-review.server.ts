import prisma from "../db.server";

export async function getRollbackReviewState(shopDomain: string, actionId: string) {
  const action = await prisma.richoShopifyAction.findFirst({
    where: { id: actionId, shopDomain },
    include: { auditEvents: { orderBy: { createdAt: "asc" } } },
  });
  if (!action) throw new Error("RICHO_ACTION_NOT_FOUND");

  const recommended = action.auditEvents.some((event) => event.event === "ROLLBACK_RECOMMENDED");
  const approved = action.auditEvents.some((event) => event.event === "ROLLBACK_APPROVED");
  const rejected = action.auditEvents.some((event) => event.event === "ROLLBACK_REJECTED");
  const rolledBack = action.auditEvents.some((event) => event.event === "ROLLED_BACK");

  return { action, recommended, approved, rejected, rolledBack };
}

export async function decideRollback(args: {
  shopDomain: string;
  actionId: string;
  decision: "approved" | "rejected";
  actorId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const action = await tx.richoShopifyAction.findFirst({
      where: { id: args.actionId, shopDomain: args.shopDomain },
      include: { auditEvents: true },
    });
    if (!action) throw new Error("RICHO_ACTION_NOT_FOUND");
    if (action.status !== "executed") throw new Error("RICHO_ROLLBACK_REVIEW_REQUIRES_EXECUTED_ACTION");
    if (!action.auditEvents.some((event) => event.event === "ROLLBACK_RECOMMENDED")) {
      throw new Error("RICHO_ROLLBACK_NOT_RECOMMENDED");
    }
    if (action.auditEvents.some((event) => event.event === "ROLLED_BACK")) {
      throw new Error("RICHO_ACTION_ALREADY_ROLLED_BACK");
    }
    if (action.auditEvents.some((event) => event.event === "ROLLBACK_APPROVED" || event.event === "ROLLBACK_REJECTED")) {
      throw new Error("RICHO_ROLLBACK_ALREADY_DECIDED");
    }

    return tx.richoShopifyAuditEvent.create({
      data: {
        actionId: args.actionId,
        event: args.decision === "approved" ? "ROLLBACK_APPROVED" : "ROLLBACK_REJECTED",
        actorType: "human",
        actorId: args.actorId,
        evidence: args.decision === "approved"
          ? "Human approved rollback after reviewing measured regression evidence."
          : "Human rejected rollback after reviewing measured regression evidence.",
      },
    });
  });
}

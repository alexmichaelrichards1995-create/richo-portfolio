import prisma from "../db.server";
import type { ProposedAction } from "./richo-control-plane.server";

export async function persistProposals(shopDomain: string, actions: ProposedAction[]) {
  for (const action of actions) {
    await prisma.richoShopifyAction.upsert({
      where: { id: action.id },
      update: {
        evidence: action.evidence,
        recommendation: action.recommendation,
        risk: action.risk,
        reversible: action.reversible,
      },
      create: {
        id: action.id,
        shopDomain,
        agent: action.agent,
        title: action.title,
        evidence: action.evidence,
        recommendation: action.recommendation,
        risk: action.risk,
        reversible: action.reversible,
        requiresHumanApproval: true,
        status: "proposed",
        auditEvents: {
          create: {
            event: "PROPOSED",
            actorType: "system",
            evidence: action.evidence,
          },
        },
      },
    });
  }
}

export async function listActions(shopDomain: string) {
  return prisma.richoShopifyAction.findMany({
    where: { shopDomain },
    orderBy: { createdAt: "desc" },
    include: { auditEvents: { orderBy: { createdAt: "asc" } } },
  });
}

export async function decideAction(args: {
  shopDomain: string;
  actionId: string;
  decision: "approved" | "rejected";
  actorId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.richoShopifyAction.findFirst({
      where: { id: args.actionId, shopDomain: args.shopDomain },
    });
    if (!current) throw new Error("RICHO_ACTION_NOT_FOUND");
    if (current.status !== "proposed") throw new Error("RICHO_ACTION_ALREADY_DECIDED");

    const updated = await tx.richoShopifyAction.update({
      where: { id: current.id },
      data: args.decision === "approved"
        ? { status: "approved", approvedBy: args.actorId, approvedAt: new Date() }
        : { status: "rejected" },
    });

    await tx.richoShopifyAuditEvent.create({
      data: {
        actionId: current.id,
        event: args.decision === "approved" ? "APPROVED" : "REJECTED",
        actorType: "human",
        actorId: args.actorId,
      },
    });
    return updated;
  });
}

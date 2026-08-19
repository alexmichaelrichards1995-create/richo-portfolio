import type { Prisma } from "@prisma/client";
import prisma from "../db.server";

export async function recordSecurityEvent(args: {
  shopDomain: string;
  event: string;
  actorId?: string;
  targetId?: string;
  correlationId?: string;
  severity?: "info" | "warn" | "error";
  payload?: Prisma.InputJsonValue;
}) {
  return prisma.richoSecurityEvent.create({
    data: {
      shopDomain: args.shopDomain,
      event: args.event,
      actorId: args.actorId,
      targetId: args.targetId,
      correlationId: args.correlationId,
      severity: args.severity ?? "info",
      payload: args.payload,
    },
  });
}

export async function listSecurityEvents(shopDomain: string, take = 50) {
  return prisma.richoSecurityEvent.findMany({
    where: { shopDomain },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(take, 1), 200),
  });
}

import { randomUUID } from "node:crypto";
import prisma from "../db.server";

export async function registerWebhookReceipt(args: {
  shopDomain: string;
  topic: string;
  webhookId: string;
  correlationId?: string;
}) {
  const correlationId = args.correlationId || randomUUID();
  try {
    await prisma.richoWebhookReceipt.create({
      data: {
        id: randomUUID(),
        shopDomain: args.shopDomain,
        topic: args.topic,
        webhookId: args.webhookId,
        correlationId,
      },
    });
    await prisma.richoShopControl.upsert({
      where: { shopDomain: args.shopDomain },
      update: { lastWebhookAt: new Date() },
      create: { shopDomain: args.shopDomain, lastWebhookAt: new Date() },
    });
    return { duplicate: false, correlationId } as const;
  } catch (error: any) {
    if (error?.code === "P2002") return { duplicate: true, correlationId } as const;
    throw error;
  }
}

export function webhookIdFromRequest(request: Request) {
  return request.headers.get("X-Shopify-Webhook-Id") || request.headers.get("x-shopify-webhook-id") || "";
}

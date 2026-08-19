import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { emitTelemetry } from "../lib/telemetry.server";
import { registerWebhookReceipt, webhookIdFromRequest } from "../lib/webhook-security.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  const webhookId = webhookIdFromRequest(request);
  if (!webhookId) return new Response("Missing webhook id", { status: 400 });

  const receipt = await registerWebhookReceipt({ shopDomain: shop, topic, webhookId });
  if (receipt.duplicate) {
    emitTelemetry("info", "shopify.webhook.duplicate", { shop, topic, correlationId: receipt.correlationId });
    return new Response(null, { status: 200, headers: { "X-RICHO-Correlation-Id": receipt.correlationId } });
  }

  emitTelemetry("warn", "shopify.webhook.app_uninstalled", { shop, topic, correlationId: receipt.correlationId });
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { shop } }),
    prisma.richoShopControl.upsert({
      where: { shopDomain: shop },
      update: { deploymentState: "BLOCKED", deploymentApproved: false, sessionsRevokedAt: new Date() },
      create: { shopDomain: shop, deploymentState: "BLOCKED", deploymentApproved: false, sessionsRevokedAt: new Date() },
    }),
  ]);
  return new Response(null, { status: 200, headers: { "X-RICHO-Correlation-Id": receipt.correlationId } });
};

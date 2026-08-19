import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { emitTelemetry } from "../lib/telemetry.server";
import { registerWebhookReceipt, webhookIdFromRequest } from "../lib/webhook-security.server";

const REQUIRED_SCOPES = ["read_products", "write_products", "read_reports"];

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  const webhookId = webhookIdFromRequest(request);
  if (!webhookId) return new Response("Missing webhook id", { status: 400 });

  const receipt = await registerWebhookReceipt({ shopDomain: shop, topic, webhookId });
  if (receipt.duplicate) {
    emitTelemetry("info", "shopify.webhook.duplicate", { shop, topic, correlationId: receipt.correlationId });
    return new Response(null, { status: 200, headers: { "X-RICHO-Correlation-Id": receipt.correlationId } });
  }

  const current = Array.isArray(payload.current) ? (payload.current as string[]) : [];
  const hasRequiredScopes = REQUIRED_SCOPES.every((scope) => current.includes(scope));
  emitTelemetry("info", "shopify.webhook.scopes_update", { shop, topic, scopes: current, correlationId: receipt.correlationId, hasRequiredScopes });

  await prisma.$transaction([
    ...(session ? [prisma.session.update({ where: { id: session.id }, data: { scope: current.toString() } })] : []),
    prisma.richoShopControl.upsert({
      where: { shopDomain: shop },
      update: { lastScopeSyncAt: new Date(), deploymentState: hasRequiredScopes ? "QUALIFIED" : "BLOCKED", ...(hasRequiredScopes ? {} : { deploymentApproved: false }) },
      create: { shopDomain: shop, lastScopeSyncAt: new Date(), deploymentState: hasRequiredScopes ? "QUALIFIED" : "BLOCKED", deploymentApproved: false },
    }),
  ]);

  return new Response(null, { status: 200, headers: { "X-RICHO-Correlation-Id": receipt.correlationId } });
};

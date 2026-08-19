import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { planEntitlements } from "../lib/richo-catalog.server";
import { processPaidOrderEvent } from "../services/shopify-event-pipeline.server";

export async function action({ request }: ActionFunctionArgs) {
  const { payload, topic, shop } = await authenticate.webhook(request);
  if (topic !== "ORDERS_PAID") return new Response("ignored", { status: 200 });

  const order = payload as any;
  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
  const plan = planEntitlements(
    lineItems.map((line: any) => ({
      id: line?.admin_graphql_api_id ?? String(line?.id ?? ""),
      sku: line?.sku ?? null,
      quantity: line?.quantity ?? 1,
    })),
  );

  const outcome = await processPaidOrderEvent({ request, shop, order, entitlements: plan });
  return Response.json({
    accepted: true,
    duplicate: outcome.duplicate,
    entitlementsPlanned: plan.length,
  });
}

export default function OrdersPaidWebhookRoute() {
  return null;
}

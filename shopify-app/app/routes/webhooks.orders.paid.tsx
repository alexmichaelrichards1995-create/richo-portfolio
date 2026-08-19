import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { planEntitlements } from "../lib/richo-catalog.server";

export async function action({ request }: ActionFunctionArgs) {
  const { payload, topic, shop } = await authenticate.webhook(request);

  if (topic !== "ORDERS_PAID") {
    return new Response("ignored", { status: 200 });
  }

  const order = payload as any;
  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
  const plan = planEntitlements(
    lineItems.map((line: any) => ({
      id: line?.admin_graphql_api_id ?? String(line?.id ?? ""),
      sku: line?.sku ?? null,
      quantity: line?.quantity ?? 1,
    })),
  );

  // Deliberately plan-only for this slice. The next layer persists the webhook
  // delivery/event id and the entitlement plan transactionally before any
  // download token, membership access, email, or external provisioning occurs.
  console.info("richo.orders_paid.entitlement_plan", {
    shop,
    orderId: order?.admin_graphql_api_id ?? order?.id ?? null,
    orderName: order?.name ?? null,
    entitlements: plan,
  });

  return Response.json({ accepted: true, entitlementsPlanned: plan.length });
}

export default function OrdersPaidWebhookRoute() {
  return null;
}

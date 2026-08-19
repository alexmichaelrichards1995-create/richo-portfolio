import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { knownRichoSkus } from "../lib/richo-catalog.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`#graphql
    query RichoOperationsDashboard {
      shop {
        name
      }
      products(first: 50, query: "status:active") {
        nodes {
          id
          title
          status
          variants(first: 20) {
            nodes {
              id
              sku
              price
            }
          }
        }
      }
      orders(first: 10, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          name
          createdAt
          displayFinancialStatus
          customer {
            id
            displayName
          }
          lineItems(first: 50) {
            nodes {
              id
              sku
              name
              quantity
            }
          }
        }
      }
    }
  `);

  const { data } = await response.json();
  const expected = new Set(knownRichoSkus());
  const liveSkus = new Set<string>();

  for (const product of data?.products?.nodes ?? []) {
    for (const variant of product.variants?.nodes ?? []) {
      if (variant.sku) liveSkus.add(String(variant.sku).toUpperCase());
    }
  }

  const missingSkus = [...expected].filter((sku) => !liveSkus.has(sku));
  const recentOrders = (data?.orders?.nodes ?? []).map((order: any) => ({
    id: order.id,
    name: order.name,
    createdAt: order.createdAt,
    financialStatus: order.displayFinancialStatus,
    customer: order.customer?.displayName ?? "Guest",
    richoItems: (order.lineItems?.nodes ?? []).filter((line: any) =>
      expected.has(String(line.sku ?? "").toUpperCase()),
    ),
  }));

  return {
    shopName: data?.shop?.name ?? "Shopify",
    catalogue: {
      expectedSkus: expected.size,
      liveKnownSkus: [...expected].filter((sku) => liveSkus.has(sku)).length,
      missingSkus,
    },
    recentOrders,
  };
}

export default function RichoOperationsHome() {
  const { shopName, catalogue, recentOrders } = useLoaderData<typeof loader>();

  return (
    <s-page heading={`R.I.C.H.O. Operations — ${shopName}`}>
      <s-section heading="Catalogue health">
        <s-stack direction="inline" gap="base">
          <s-badge tone={catalogue.missingSkus.length ? "warning" : "success"}>
            {catalogue.liveKnownSkus}/{catalogue.expectedSkus} canonical SKUs live
          </s-badge>
        </s-stack>
        {catalogue.missingSkus.length > 0 ? (
          <s-paragraph>
            Missing canonical SKUs: {catalogue.missingSkus.join(", ")}
          </s-paragraph>
        ) : (
          <s-paragraph>All canonical R.I.C.H.O. SKUs are present.</s-paragraph>
        )}
      </s-section>

      <s-section heading="Recent orders">
        {recentOrders.length === 0 ? (
          <s-paragraph>No recent orders returned.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {recentOrders.map((order: any) => (
              <s-box key={order.id} padding="base" borderWidth="base" borderRadius="base">
                <s-heading>{order.name}</s-heading>
                <s-paragraph>
                  {order.customer} · {order.financialStatus} · {order.richoItems.length} R.I.C.H.O. line item(s)
                </s-paragraph>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Next controls">
        <s-paragraph>
          Entitlement persistence, digital-delivery tokens, membership lifecycle sync,
          provisioning retries and audit logging are the next implementation layer.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

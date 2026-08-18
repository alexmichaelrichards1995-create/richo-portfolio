import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { evaluateCommerce } from "../lib/richo-engine.server";

function numberCell(row: unknown[], index: number) {
  const value = Number(row[index] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`#graphql
    query RichoOperationsSnapshot {
      products(first: 100) {
        nodes { status }
      }
      collections(first: 100) {
        nodes { id }
      }
      customersCount { count }
      ordersCount { count }
      shopifyqlQuery(
        query: "FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout SINCE -30d UNTIL today"
      ) {
        tableData { columns { name } rows }
        parseErrors
      }
      sales: shopifyqlQuery(
        query: "FROM sales SHOW orders, total_sales SINCE -30d UNTIL today"
      ) {
        tableData { columns { name } rows }
        parseErrors
      }
    }
  `);

  const payload = await response.json();
  const data = payload.data ?? {};
  const products = data.products?.nodes ?? [];
  const activeProducts = products.filter((p: { status: string }) => p.status === "ACTIVE").length;
  const draftProducts = products.filter((p: { status: string }) => p.status === "DRAFT").length;

  const sessionRows: unknown[][] = data.shopifyqlQuery?.tableData?.rows ?? [];
  const sessionTotals = sessionRows.reduce(
    (acc, row) => ({
      sessions: acc.sessions + numberCell(row, 0),
      addToCarts: acc.addToCarts + numberCell(row, 1),
      checkouts: acc.checkouts + numberCell(row, 2),
      purchases: acc.purchases + numberCell(row, 3),
    }),
    { sessions: 0, addToCarts: 0, checkouts: 0, purchases: 0 },
  );

  const salesRows: unknown[][] = data.sales?.tableData?.rows ?? [];
  const salesTotals = salesRows.reduce(
    (acc, row) => ({
      orders: acc.orders + numberCell(row, 0),
      revenue: acc.revenue + numberCell(row, 1),
    }),
    { orders: 0, revenue: 0 },
  );

  const analyticsErrors = [
    ...(data.shopifyqlQuery?.parseErrors ?? []),
    ...(data.sales?.parseErrors ?? []),
  ];

  const snapshot = {
    ...sessionTotals,
    activeProducts,
    draftProducts,
    collections: data.collections?.nodes?.length ?? 0,
    customers: data.customersCount?.count ?? 0,
    orders: salesTotals.orders || data.ordersCount?.count || 0,
    revenue: salesTotals.revenue,
  };

  return {
    snapshot,
    decision: evaluateCommerce(snapshot),
    analyticsErrors,
  };
}

export default function RichoOperationsHome() {
  const { snapshot, decision, analyticsErrors } = useLoaderData<typeof loader>();

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, opacity: 0.65 }}>R.I.C.H.O. Systems · Shopify Operations OS</p>
        <h1 style={{ marginTop: 6 }}>Mission Control</h1>
        <p>
          Evidence-first operating intelligence for the connected Shopify business. The engine recommends actions
          from observed store state; irreversible, financial and customer-impacting actions remain human-approved.
        </p>
      </header>

      {analyticsErrors.length > 0 && (
        <section style={{ border: "1px solid #d8a600", borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <strong>Analytics adapter warning</strong>
          <p style={{ marginBottom: 0 }}>{analyticsErrors.join(" · ")}</p>
        </section>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Metric label="Operating score" value={`${decision.operatingScore}/100`} />
        <Metric label="30d sessions" value={snapshot.sessions} />
        <Metric label="Add-to-cart rate" value={`${decision.addToCartRate.toFixed(2)}%`} />
        <Metric label="Checkout rate" value={`${decision.checkoutRate.toFixed(2)}%`} />
        <Metric label="Conversion rate" value={`${decision.conversionRate.toFixed(2)}%`} />
        <Metric label="30d revenue" value={`A$${snapshot.revenue.toFixed(2)}`} />
        <Metric label="Active products" value={snapshot.activeProducts} />
        <Metric label="Orders" value={snapshot.orders} />
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Next best action</h2>
        {decision.nextBestAction ? (
          <article style={{ border: "1px solid #d6d6d6", borderRadius: 12, padding: 18 }}>
            <strong>{decision.nextBestAction.title}</strong>
            <p>{decision.nextBestAction.evidence}</p>
            <p>{decision.nextBestAction.recommendation}</p>
          </article>
        ) : (
          <p>No material operating exception detected from the available data.</p>
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Evidence register</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {decision.findings.map((finding) => (
            <article key={finding.id} style={{ border: "1px solid #e3e3e3", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>{finding.title}</strong>
                <span>{finding.severity.toUpperCase()}</span>
              </div>
              <p>{finding.evidence}</p>
              <p style={{ marginBottom: 8 }}>{finding.recommendation}</p>
              <small>{finding.domain}</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <article style={{ border: "1px solid #e3e3e3", borderRadius: 12, padding: 16 }}>
      <div style={{ opacity: 0.65, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </article>
  );
}

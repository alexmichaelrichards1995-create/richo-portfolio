import { json } from "react-router";
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { evaluateCommerce } from "../lib/richo-engine.server";

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
    }
  `);

  const payload = await response.json();
  const products = payload.data?.products?.nodes ?? [];
  const activeProducts = products.filter((p: { status: string }) => p.status === "ACTIVE").length;
  const draftProducts = products.filter((p: { status: string }) => p.status === "DRAFT").length;

  // ShopifyQL analytics is intentionally isolated behind an adapter boundary.
  // Wire the live analytics adapter once the app's approved access scopes are configured.
  const snapshot = {
    sessions: 0,
    addToCarts: 0,
    checkouts: 0,
    purchases: 0,
    activeProducts,
    draftProducts,
    collections: payload.data?.collections?.nodes?.length ?? 0,
    customers: payload.data?.customersCount?.count ?? 0,
    orders: payload.data?.ordersCount?.count ?? 0,
    revenue: 0,
  };

  return json({ snapshot, decision: evaluateCommerce(snapshot) });
}

export default function RichoOperationsHome() {
  const { snapshot, decision } = useLoaderData<typeof loader>();

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, opacity: 0.65 }}>R.I.C.H.O. Systems · Shopify Operations OS</p>
        <h1 style={{ marginTop: 6 }}>Mission Control</h1>
        <p>
          Evidence-first operating intelligence for the connected Shopify business. Recommendations are generated
          from observed store state; no autonomous financial or irreversible actions are executed.
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <Metric label="Operating score" value={`${decision.operatingScore}/100`} />
        <Metric label="Active products" value={snapshot.activeProducts} />
        <Metric label="Draft products" value={snapshot.draftProducts} />
        <Metric label="Collections" value={snapshot.collections} />
        <Metric label="Customers" value={snapshot.customers} />
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
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </article>
  );
}

import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { evaluateCommerce } from "../lib/richo-engine.server";
import { initialAuditLedger, proposeActions } from "../lib/richo-control-plane.server";

function numberCell(row: unknown[], index: number) {
  const value = Number(row[index] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(`#graphql
    query RichoOperationsSnapshot {
      products(first: 100) { nodes { status } }
      collections(first: 100) { nodes { id } }
      customersCount { count }
      ordersCount { count }
      shopifyqlQuery(query: "FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout SINCE -30d UNTIL today") {
        tableData { columns { name } rows }
        parseErrors
      }
      sales: shopifyqlQuery(query: "FROM sales SHOW orders, total_sales SINCE -30d UNTIL today") {
        tableData { columns { name } rows }
        parseErrors
      }
    }
  `);
  const payload = await response.json();
  const data = payload.data ?? {};
  const products = data.products?.nodes ?? [];
  const sessionRows: unknown[][] = data.shopifyqlQuery?.tableData?.rows ?? [];
  const sessionTotals = sessionRows.reduce((acc, row) => ({
    sessions: acc.sessions + numberCell(row, 0), addToCarts: acc.addToCarts + numberCell(row, 1),
    checkouts: acc.checkouts + numberCell(row, 2), purchases: acc.purchases + numberCell(row, 3),
  }), { sessions: 0, addToCarts: 0, checkouts: 0, purchases: 0 });
  const salesRows: unknown[][] = data.sales?.tableData?.rows ?? [];
  const salesTotals = salesRows.reduce((acc, row) => ({ orders: acc.orders + numberCell(row, 0), revenue: acc.revenue + numberCell(row, 1) }), { orders: 0, revenue: 0 });
  const snapshot = {
    ...sessionTotals,
    activeProducts: products.filter((p: { status: string }) => p.status === "ACTIVE").length,
    draftProducts: products.filter((p: { status: string }) => p.status === "DRAFT").length,
    collections: data.collections?.nodes?.length ?? 0,
    customers: data.customersCount?.count ?? 0,
    orders: salesTotals.orders || data.ordersCount?.count || 0,
    revenue: salesTotals.revenue,
  };
  const decision = evaluateCommerce(snapshot);
  const approvalQueue = proposeActions(decision.findings);
  return {
    snapshot, decision, approvalQueue, auditLedger: initialAuditLedger(approvalQueue),
    analyticsErrors: [...(data.shopifyqlQuery?.parseErrors ?? []), ...(data.sales?.parseErrors ?? [])],
  };
}

export default function RichoOperationsHome() {
  const { snapshot, decision, approvalQueue, auditLedger, analyticsErrors } = useLoaderData<typeof loader>();
  return <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
    <header><p style={{opacity:.65}}>R.I.C.H.O. Systems · Shopify Operations OS</p><h1>Mission Control</h1><p>Observe → reason → propose → approve → execute → verify. Sensitive actions never bypass human approval.</p></header>
    {analyticsErrors.length > 0 && <section style={{border:"1px solid #d8a600",padding:14,borderRadius:10}}><strong>Analytics warning</strong><p>{analyticsErrors.join(" · ")}</p></section>}
    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:12,marginTop:20}}>
      <Metric label="Operating score" value={`${decision.operatingScore}/100`}/><Metric label="30d sessions" value={snapshot.sessions}/><Metric label="Add-to-cart" value={`${decision.addToCartRate.toFixed(2)}%`}/><Metric label="Checkout" value={`${decision.checkoutRate.toFixed(2)}%`}/><Metric label="Conversion" value={`${decision.conversionRate.toFixed(2)}%`}/><Metric label="Revenue" value={`A$${snapshot.revenue.toFixed(2)}`}/>
    </section>
    <section style={{marginTop:28}}><h2>AI Operations Agents</h2><p>Conversion · Catalog · Revenue · Customer · Governance</p></section>
    <section style={{marginTop:28}}><h2>Approval Queue</h2><div style={{display:"grid",gap:10}}>{approvalQueue.map(a=><article key={a.id} style={{border:"1px solid #ddd",borderRadius:10,padding:16}}><strong>{a.title}</strong><p>{a.evidence}</p><p>{a.recommendation}</p><small>Agent: {a.agent} · Risk: {a.risk} · Status: {a.status} · Human approval required</small></article>)}</div></section>
    <section style={{marginTop:28}}><h2>Audit Ledger</h2><p>{auditLedger.length} evidence-backed proposal event(s) recorded in the current operating snapshot. Persistent storage is the next adapter boundary.</p></section>
    <section style={{marginTop:28}}><h2>Conversion Lab</h2><p>Current funnel: {snapshot.sessions} sessions → {snapshot.addToCarts} carts → {snapshot.checkouts} checkouts → {snapshot.purchases} purchases.</p></section>
  </main>;
}
function Metric({label,value}:{label:string;value:string|number}){return <article style={{border:"1px solid #e3e3e3",borderRadius:12,padding:16}}><div style={{opacity:.65,fontSize:13}}>{label}</div><div style={{fontSize:24,fontWeight:700}}>{value}</div></article>}

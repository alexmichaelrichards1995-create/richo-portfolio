import { Form, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { evaluateCommerce } from "../lib/richo-engine.server";
import { proposeActions } from "../lib/richo-control-plane.server";
import { attachExecutionEnvelope, decideAction, getAction, listActions, persistProposals } from "../lib/approval-repository.server";
import { rankProducts } from "../lib/product-intelligence.server";
import { fetchProductState, hashProductState, rollbackSnapshot } from "../lib/product-state.server";
import { executeApprovedProductUpdate } from "../lib/shopify-product-executor.server";

function numberCell(row: unknown[], index: number) {
  const value = Number(row[index] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const actionId = String(form.get("actionId") ?? "");
  const intent = String(form.get("intent") ?? "");
  if (!actionId) throw new Response("Invalid action request", { status: 400 });

  if (intent === "approved" || intent === "rejected") {
    await decideAction({ shopDomain: session.shop, actionId, decision: intent, actorId: session.id });
    return { ok: true, intent };
  }

  if (intent === "execute") {
    const row = await getAction(session.shop, actionId);
    if (!row) throw new Response("Action not found", { status: 404 });
    const payload = row.mutationPayload as { kind?: string; productId?: string } | null;
    if (payload?.kind !== "product_update" || !payload.productId || !row.expectedStateHash) {
      throw new Response("Action has no executable product envelope", { status: 400 });
    }
    const currentState = await fetchProductState(admin.graphql, payload.productId);
    const currentHash = hashProductState(currentState);
    await executeApprovedProductUpdate({
      shopDomain: session.shop,
      actionId,
      expectedStateMatches: currentHash === row.expectedStateHash,
      idempotencyKey: `richo:${actionId}:${row.expectedStateHash}`,
      adminGraphql: admin.graphql,
    });
    return { ok: true, intent };
  }

  throw new Response("Unsupported action intent", { status: 400 });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const response = await admin.graphql(`#graphql
    query RichoOperationsSnapshot {
      products(first: 100) {
        nodes {
          id title descriptionHtml status updatedAt
          seo { title description }
          media(first: 10) { nodes { id } }
          variants(first: 1) { nodes { price } }
        }
      }
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
  await persistProposals(session.shop, proposeActions(decision.findings));

  const productIntelligence = rankProducts(products.map((p: any) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    descriptionLength: String(p.descriptionHtml ?? "").replace(/<[^>]*>/g, "").trim().length,
    mediaCount: p.media?.nodes?.length ?? 0,
    price: Number(p.variants?.nodes?.[0]?.price ?? 0),
  })));

  for (const product of products) {
    const intelligence = productIntelligence.find((item) => item.id === product.id);
    if (!intelligence || intelligence.score >= 85 || product.seo?.title) continue;
    const actionId = `action:product-seo:${product.id}`;
    await persistProposals(session.shop, [{
      id: actionId,
      agent: "catalog",
      title: `Repair SEO title for ${product.title}`,
      evidence: `Product health score ${intelligence.score}/100; Shopify SEO title is empty.`,
      recommendation: `Set the SEO title to the verified product title, then re-measure search and product performance.`,
      risk: "low",
      reversible: true,
      requiresHumanApproval: true,
      status: "proposed",
      createdAt: new Date().toISOString(),
    }]);
    const state = await fetchProductState(admin.graphql, product.id);
    await attachExecutionEnvelope({
      shopDomain: session.shop,
      actionId,
      expectedStateHash: hashProductState(state),
      rollbackPayload: rollbackSnapshot(state),
      mutationPayload: { kind: "product_update", productId: product.id, seo: { title: product.title, description: product.seo?.description ?? undefined } },
    });
  }

  const approvalQueue = await listActions(session.shop);
  return {
    snapshot, decision, approvalQueue, productIntelligence,
    analyticsErrors: [...(data.shopifyqlQuery?.parseErrors ?? []), ...(data.sales?.parseErrors ?? [])],
  };
}

export default function RichoOperationsHome() {
  const { snapshot, decision, approvalQueue, productIntelligence, analyticsErrors } = useLoaderData<typeof loader>();
  const auditCount = approvalQueue.reduce((sum, action) => sum + action.auditEvents.length, 0);
  return <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
    <header><p style={{opacity:.65}}>R.I.C.H.O. Systems · Shopify Operations OS</p><h1>Mission Control</h1><p>Observe → reason → propose → approve → execute → verify. Sensitive actions never bypass human approval.</p></header>
    {analyticsErrors.length > 0 && <section style={{border:"1px solid #d8a600",padding:14,borderRadius:10}}><strong>Analytics warning</strong><p>{analyticsErrors.join(" · ")}</p></section>}
    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:12,marginTop:20}}>
      <Metric label="Operating score" value={`${decision.operatingScore}/100`}/><Metric label="30d sessions" value={snapshot.sessions}/><Metric label="Add-to-cart" value={`${decision.addToCartRate.toFixed(2)}%`}/><Metric label="Checkout" value={`${decision.checkoutRate.toFixed(2)}%`}/><Metric label="Conversion" value={`${decision.conversionRate.toFixed(2)}%`}/><Metric label="Revenue" value={`A$${snapshot.revenue.toFixed(2)}`}/>
    </section>
    <section style={{marginTop:28}}><h2>Product Intelligence</h2><div style={{display:"grid",gap:8}}>{productIntelligence.map(p=><article key={p.id} style={{border:"1px solid #e5e5e5",borderRadius:10,padding:14}}><strong>{p.title} · {p.score}/100</strong><p>{p.issues.length ? p.issues.join(" · ") : "No structural issues detected."}</p><small>{p.recommendation}</small></article>)}</div></section>
    <section style={{marginTop:28}}><h2>AI Operations Agents</h2><p>Conversion · Catalog · Revenue · Customer · Governance</p></section>
    <section style={{marginTop:28}}><h2>Approval Queue</h2><div style={{display:"grid",gap:10}}>{approvalQueue.map(a=><article key={a.id} style={{border:"1px solid #ddd",borderRadius:10,padding:16}}><strong>{a.title}</strong><p>{a.evidence}</p><p>{a.recommendation}</p><small>Agent: {a.agent} · Risk: {a.risk} · Status: {a.status}</small>{a.status === "proposed" && <Form method="post" style={{display:"flex",gap:8,marginTop:12}}><input type="hidden" name="actionId" value={a.id}/><button type="submit" name="intent" value="approved">Approve</button><button type="submit" name="intent" value="rejected">Reject</button></Form>}{a.status === "approved" && <Form method="post" style={{marginTop:12}}><input type="hidden" name="actionId" value={a.id}/><button type="submit" name="intent" value="execute">Execute Approved Change</button></Form>}</article>)}</div></section>
    <section style={{marginTop:28}}><h2>Audit Ledger</h2><p>{auditCount} persisted audit event(s) across the current operating queue.</p></section>
    <section style={{marginTop:28}}><h2>Conversion Lab</h2><p>Current funnel: {snapshot.sessions} sessions → {snapshot.addToCarts} carts → {snapshot.checkouts} checkouts → {snapshot.purchases} purchases.</p></section>
  </main>;
}
function Metric({label,value}:{label:string;value:string|number}){return <article style={{border:"1px solid #e3e3e3",borderRadius:12,padding:16}}><div style={{opacity:.65,fontSize:13}}>{label}</div><div style={{fontSize:24,fontWeight:700}}>{value}</div></article>}

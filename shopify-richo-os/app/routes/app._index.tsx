import { Form, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { evaluateCommerce } from "../lib/richo-engine.server";
import { proposeActions } from "../lib/richo-control-plane.server";
import { attachExecutionEnvelope, decideAction, getAction, listActions, persistProposals } from "../lib/approval-repository.server";
import { rankProducts } from "../lib/product-intelligence.server";
import { fetchProductState, hashProductState, rollbackSnapshot } from "../lib/product-state.server";
import { executeApprovedProductUpdate } from "../lib/shopify-product-executor.server";
import { rollbackExecutedProductUpdate } from "../lib/shopify-product-rollback.server";
import { decideRollback } from "../lib/rollback-review.server";
import { listExperiments, markExperimentRolledBack, measureExperiment, startExperiment } from "../lib/experiment-ledger.server";
import { fetchProductExperimentMetrics } from "../lib/product-experiment-metrics.server";
import { requireOperatorCapability } from "../lib/operator-policy.server";
import { deploymentState } from "../lib/deployment-gate.server";
import { emitTelemetry } from "../lib/telemetry.server";

function numberCell(row: unknown[], index: number) { const value = Number(row[index] ?? 0); return Number.isFinite(value) ? value : 0; }
function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(date: Date, days: number) { const d = new Date(date); d.setUTCDate(d.getUTCDate() + days); return d; }

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const actionId = String(form.get("actionId") ?? "");
  const intent = String(form.get("intent") ?? "");
  if (!actionId) throw new Response("Invalid action request", { status: 400 });

  try {
    if (intent === "approved" || intent === "rejected") {
      requireOperatorCapability(session.id, "approve");
      await decideAction({ shopDomain: session.shop, actionId, decision: intent, actorId: session.id });
      emitTelemetry("info", "operator.action_decision", { shop: session.shop, actionId, intent, actorId: session.id });
      return { ok: true, intent };
    }

    if (intent === "approve_rollback" || intent === "reject_rollback") {
      requireOperatorCapability(session.id, "approve");
      await decideRollback({ shopDomain: session.shop, actionId, decision: intent === "approve_rollback" ? "approved" : "rejected", actorId: session.id });
      emitTelemetry("info", "operator.rollback_decision", { shop: session.shop, actionId, intent, actorId: session.id });
      return { ok: true, intent };
    }

    if (intent === "execute") {
      requireOperatorCapability(session.id, "execute");
      const row = await getAction(session.shop, actionId);
      if (!row) throw new Response("Action not found", { status: 404 });
      const payload = row.mutationPayload as { kind?: string; productId?: string } | null;
      if (payload?.kind !== "product_update" || !payload.productId || !row.expectedStateHash) throw new Response("Action has no executable product envelope", { status: 400 });
      const currentState = await fetchProductState(admin.graphql, payload.productId);
      const now = new Date();
      const baseline = await fetchProductExperimentMetrics({ adminGraphql: admin.graphql, productTitle: currentState.title, productHandle: currentState.handle, from: addDays(now, -7), to: addDays(now, -1) });
      await startExperiment({ shopDomain: session.shop, actionId, baseline, targetProductId: payload.productId });
      await executeApprovedProductUpdate({ shopDomain: session.shop, actionId, expectedStateMatches: hashProductState(currentState) === row.expectedStateHash, idempotencyKey: `richo:${actionId}:${row.expectedStateHash}`, adminGraphql: admin.graphql });
      emitTelemetry("info", "operator.action_executed", { shop: session.shop, actionId, actorId: session.id });
      return { ok: true, intent };
    }

    if (intent === "measure") {
      const experiments = await listExperiments(session.shop);
      const experiment = experiments.find((e) => e.actionId === actionId && e.status === "running");
      if (!experiment) throw new Response("Running experiment not found", { status: 404 });
      if (!experiment.targetProductId) throw new Response("Experiment has no product attribution target", { status: 400 });
      const started = new Date(experiment.startedAt);
      const readyAt = addDays(started, 7);
      if (new Date() < readyAt) throw new Response(`Measurement window not complete until ${isoDate(readyAt)}`, { status: 409 });
      const product = await fetchProductState(admin.graphql, experiment.targetProductId);
      const outcome = await fetchProductExperimentMetrics({ adminGraphql: admin.graphql, productTitle: product.title, productHandle: product.handle, from: started, to: addDays(started, 6) });
      await measureExperiment({ shopDomain: session.shop, actionId, outcome });
      emitTelemetry("info", "experiment.measured", { shop: session.shop, actionId });
      return { ok: true, intent };
    }

    if (intent === "rollback") {
      requireOperatorCapability(session.id, "rollback");
      const result = await rollbackExecutedProductUpdate({ shopDomain: session.shop, actionId, actorId: session.id, adminGraphql: admin.graphql });
      await markExperimentRolledBack({ shopDomain: session.shop, actionId, restoredHash: result.restoredHash });
      emitTelemetry("warn", "operator.rollback_executed", { shop: session.shop, actionId, actorId: session.id, restoredHash: result.restoredHash });
      return { ok: true, intent };
    }
    throw new Response("Unsupported action intent", { status: 400 });
  } catch (error) {
    emitTelemetry("error", "mission_control.action_failed", { shop: session.shop, actionId, intent, actorId: session.id, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const response = await admin.graphql(`#graphql
    query RichoOperationsSnapshot {
      products(first: 100) { nodes { id title descriptionHtml status updatedAt seo { title description } media(first: 10) { nodes { id } } variants(first: 1) { nodes { price } } } }
      collections(first: 100) { nodes { id } }
      customersCount { count }
      ordersCount { count }
      shopifyqlQuery(query: "FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout SINCE -30d UNTIL today") { tableData { rows } parseErrors }
      sales: shopifyqlQuery(query: "FROM sales SHOW orders, total_sales SINCE -30d UNTIL today") { tableData { rows } parseErrors }
    }
  `);
  const payload = await response.json();
  const data = payload.data ?? {};
  const products = data.products?.nodes ?? [];
  const sessionRows: unknown[][] = data.shopifyqlQuery?.tableData?.rows ?? [];
  const sessionTotals = sessionRows.reduce((acc, row) => ({ sessions: acc.sessions + numberCell(row, 0), addToCarts: acc.addToCarts + numberCell(row, 1), checkouts: acc.checkouts + numberCell(row, 2), purchases: acc.purchases + numberCell(row, 3) }), { sessions: 0, addToCarts: 0, checkouts: 0, purchases: 0 });
  const salesRows: unknown[][] = data.sales?.tableData?.rows ?? [];
  const salesTotals = salesRows.reduce((acc, row) => ({ orders: acc.orders + numberCell(row, 0), revenue: acc.revenue + numberCell(row, 1) }), { orders: 0, revenue: 0 });
  const snapshot = { ...sessionTotals, activeProducts: products.filter((p: { status: string }) => p.status === "ACTIVE").length, draftProducts: products.filter((p: { status: string }) => p.status === "DRAFT").length, collections: data.collections?.nodes?.length ?? 0, customers: data.customersCount?.count ?? 0, orders: salesTotals.orders || data.ordersCount?.count || 0, revenue: salesTotals.revenue };
  const decision = evaluateCommerce(snapshot);
  await persistProposals(session.shop, proposeActions(decision.findings));
  const productIntelligence = rankProducts(products.map((p: any) => ({ id: p.id, title: p.title, status: p.status, descriptionLength: String(p.descriptionHtml ?? "").replace(/<[^>]*>/g, "").trim().length, mediaCount: p.media?.nodes?.length ?? 0, price: Number(p.variants?.nodes?.[0]?.price ?? 0) })));
  for (const product of products) {
    const intelligence = productIntelligence.find((item) => item.id === product.id);
    if (!intelligence || intelligence.score >= 85 || product.seo?.title) continue;
    const actionId = `action:product-seo:${product.id}`;
    await persistProposals(session.shop, [{ id: actionId, agent: "catalog", title: `Repair SEO title for ${product.title}`, evidence: `Product health score ${intelligence.score}/100; Shopify SEO title is empty.`, recommendation: "Set the SEO title to the verified product title, then re-measure search and product performance.", risk: "low", reversible: true, requiresHumanApproval: true, status: "proposed", createdAt: new Date().toISOString() }]);
    const state = await fetchProductState(admin.graphql, product.id);
    await attachExecutionEnvelope({ shopDomain: session.shop, actionId, expectedStateHash: hashProductState(state), rollbackPayload: rollbackSnapshot(state), mutationPayload: { kind: "product_update", productId: product.id, seo: { title: product.title, description: product.seo?.description ?? undefined } } });
  }
  const approvalQueue = await listActions(session.shop);
  const experiments = await listExperiments(session.shop);
  const deployment = deploymentState();
  return { snapshot, decision, approvalQueue, productIntelligence, experiments, deployment, analyticsErrors: [...(data.shopifyqlQuery?.parseErrors ?? []), ...(data.sales?.parseErrors ?? [])] };
}

export default function RichoOperationsHome() {
  const { snapshot, decision, approvalQueue, productIntelligence, experiments, deployment, analyticsErrors } = useLoaderData<typeof loader>();
  const auditCount = approvalQueue.reduce((sum, action) => sum + action.auditEvents.length, 0);
  return <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
    <header><p style={{opacity:.65}}>R.I.C.H.O. Systems · Shopify Operations OS</p><h1>Mission Control</h1><p>Observe → reason → propose → approve → execute → verify → measure → governed rollback when required.</p></header>
    <section style={{border:"1px solid #bbb",padding:14,borderRadius:10,marginTop:16}}><strong>Deployment Gate: {deployment.state}</strong>{deployment.reasons.length > 0 && <p>{deployment.reasons.join(" ")}</p>}</section>
    {analyticsErrors.length > 0 && <section style={{border:"1px solid #d8a600",padding:14,borderRadius:10}}><strong>Analytics warning</strong><p>{analyticsErrors.join(" · ")}</p></section>}
    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:12,marginTop:20}}><Metric label="Operating score" value={`${decision.operatingScore}/100`}/><Metric label="30d sessions" value={snapshot.sessions}/><Metric label="Add-to-cart" value={`${decision.addToCartRate.toFixed(2)}%`}/><Metric label="Checkout" value={`${decision.checkoutRate.toFixed(2)}%`}/><Metric label="Conversion" value={`${decision.conversionRate.toFixed(2)}%`}/><Metric label="Revenue" value={`A$${snapshot.revenue.toFixed(2)}`}/></section>
    <section style={{marginTop:28}}><h2>Product Intelligence</h2><div style={{display:"grid",gap:8}}>{productIntelligence.map(p=><article key={p.id} style={{border:"1px solid #e5e5e5",borderRadius:10,padding:14}}><strong>{p.title} · {p.score}/100</strong><p>{p.issues.length ? p.issues.join(" · ") : "No structural issues detected."}</p><small>{p.recommendation}</small></article>)}</div></section>
    <section style={{marginTop:28}}><h2>Approval Queue</h2><div style={{display:"grid",gap:10}}>{approvalQueue.map(a=>{const rolledBack=a.auditEvents.some(e=>e.event==="ROLLED_BACK");const rollbackRecommended=a.auditEvents.some(e=>e.event==="ROLLBACK_RECOMMENDED");const rollbackApproved=a.auditEvents.some(e=>e.event==="ROLLBACK_APPROVED");const rollbackRejected=a.auditEvents.some(e=>e.event==="ROLLBACK_REJECTED");return <article key={a.id} style={{border:"1px solid #ddd",borderRadius:10,padding:16}}><strong>{a.title}</strong><p>{a.evidence}</p><p>{a.recommendation}</p><small>Agent: {a.agent} · Risk: {a.risk} · Status: {rolledBack ? "rolled back" : a.status}</small>{a.status === "proposed" && <Form method="post" style={{display:"flex",gap:8,marginTop:12}}><input type="hidden" name="actionId" value={a.id}/><button name="intent" value="approved">Approve</button><button name="intent" value="rejected">Reject</button></Form>}{a.status === "approved" && <Form method="post" style={{marginTop:12}}><input type="hidden" name="actionId" value={a.id}/><button name="intent" value="execute">Execute Approved Change</button></Form>}{a.status === "executed" && rollbackRecommended && !rollbackApproved && !rollbackRejected && !rolledBack && <Form method="post" style={{display:"flex",gap:8,marginTop:12}}><input type="hidden" name="actionId" value={a.id}/><button name="intent" value="approve_rollback">Approve Recommended Rollback</button><button name="intent" value="reject_rollback">Reject Rollback</button></Form>}{a.status === "executed" && rollbackApproved && !rolledBack && <Form method="post" style={{marginTop:12}}><input type="hidden" name="actionId" value={a.id}/><button name="intent" value="rollback">Execute Approved Rollback</button></Form>}</article>})}</div></section>
    <section style={{marginTop:28}}><h2>Audit Ledger</h2><p>{auditCount} persisted audit event(s) across the current operating queue.</p></section>
    <section style={{marginTop:28}}><h2>Conversion Lab</h2><p>Current funnel: {snapshot.sessions} sessions → {snapshot.addToCarts} carts → {snapshot.checkouts} checkouts → {snapshot.purchases} purchases.</p><div style={{display:"grid",gap:10}}>{experiments.map(e=><article key={e.id} style={{border:"1px solid #ddd",borderRadius:10,padding:14}}><strong>{e.actionId}</strong><p>Status: {e.status}{e.impact ? ` · Impact: ${String(e.impact).replace("_"," ")}` : ""}{e.confidence ? ` · Confidence: ${e.confidence}` : ""}</p>{e.recommendation && <p><strong>R.I.C.H.O. recommendation:</strong> {String(e.recommendation).replace(/_/g," ")}</p>}<small>Baseline: {e.baseline.sessions} product sessions · {e.baseline.purchases} completed-checkout sessions · A${e.baseline.revenue} attributed sales</small>{e.outcome && <p><small>Outcome: {e.outcome.sessions} product sessions · {e.outcome.purchases} completed-checkout sessions · A${e.outcome.revenue} attributed sales</small></p>}{e.status === "running" && <Form method="post" style={{marginTop:10}}><input type="hidden" name="actionId" value={e.actionId}/><button name="intent" value="measure">Measure 7-Day Outcome</button></Form>}</article>)}</div></section>
  </main>;
}
function Metric({label,value}:{label:string;value:string|number}){return <article style={{border:"1px solid #e3e3e3",borderRadius:12,padding:16}}><div style={{opacity:.65,fontSize:13}}>{label}</div><div style={{fontSize:24,fontWeight:700}}>{value}</div></article>}

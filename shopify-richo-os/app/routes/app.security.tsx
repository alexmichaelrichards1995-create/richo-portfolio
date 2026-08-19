import { Form, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { bootstrapAccountOwnerOperator, getInstallationQualification, revokeShopSessions } from "../lib/operational-security.server";
import { requireOperatorCapability, upsertOperator } from "../lib/operator-store.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  await bootstrapAccountOwnerOperator(session.shop, session.id);
  const [qualification, sessions, receipts] = await Promise.all([
    getInstallationQualification(session.shop),
    prisma.session.findMany({ where: { shop: session.shop }, select: { id: true, email: true, firstName: true, lastName: true, accountOwner: true }, orderBy: { id: "asc" } }),
    prisma.richoWebhookReceipt.findMany({ where: { shopDomain: session.shop }, orderBy: { processedAt: "desc" }, take: 20 }),
  ]);
  return { qualification, sessions, receipts, currentSessionId: session.id };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  await bootstrapAccountOwnerOperator(session.shop, session.id);
  await requireOperatorCapability(session.shop, session.id, "administer");
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "save_operator") {
    const targetSessionId = String(form.get("targetSessionId") ?? "");
    if (!targetSessionId) throw new Response("Missing operator session", { status: 400 });
    const target = await prisma.session.findFirst({ where: { id: targetSessionId, shop: session.shop } });
    if (!target) throw new Response("Session not found for this shop", { status: 404 });
    await upsertOperator({
      shopDomain: session.shop,
      sessionId: targetSessionId,
      canApprove: form.get("canApprove") === "on",
      canExecute: form.get("canExecute") === "on",
      canRollback: form.get("canRollback") === "on",
      canAdminister: form.get("canAdminister") === "on",
      active: form.get("active") === "on",
    });
    return { ok: true, intent };
  }

  if (intent === "revoke_sessions") {
    await revokeShopSessions(session.shop, session.id);
    return { ok: true, intent };
  }

  if (intent === "set_deployment_approval") {
    const approved = form.get("approved") === "true";
    const qualification = await getInstallationQualification(session.shop);
    if (approved && qualification.state === "BLOCKED") throw new Response("Installation is not technically qualified", { status: 409 });
    await prisma.richoShopControl.upsert({
      where: { shopDomain: session.shop },
      create: { shopDomain: session.shop, deploymentState: approved ? "APPROVED" : "QUALIFIED", deploymentApproved: approved },
      update: { deploymentState: approved ? "APPROVED" : "QUALIFIED", deploymentApproved: approved },
    });
    return { ok: true, intent };
  }

  throw new Response("Unsupported security action", { status: 400 });
}

export default function SecurityControl() {
  const { qualification, sessions, receipts, currentSessionId } = useLoaderData<typeof loader>();
  return <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
    <header><p style={{opacity:.65}}>R.I.C.H.O. Systems · Operational Security</p><h1>Installation Qualification</h1><p>Current state: <strong>{qualification.state}</strong></p></header>
    <section style={{display:"grid",gap:8,marginTop:20}}>{qualification.checks.map(c=><article key={c.id} style={{border:"1px solid #ddd",borderRadius:10,padding:12}}><strong>{c.ok ? "PASS" : "BLOCK"} · {c.label}</strong>{c.detail && <p>{c.detail}</p>}</article>)}</section>
    <section style={{marginTop:28}}><h2>Deployment Decision</h2><Form method="post" style={{display:"flex",gap:8}}><button name="intent" value="set_deployment_approval" onClick={(e)=>{const f=e.currentTarget.form;if(f){const i=document.createElement('input');i.type='hidden';i.name='approved';i.value='true';f.appendChild(i)}}}>Approve Deployment</button><button name="intent" value="set_deployment_approval" onClick={(e)=>{const f=e.currentTarget.form;if(f){const i=document.createElement('input');i.type='hidden';i.name='approved';i.value='false';f.appendChild(i)}}}>Remove Approval</button></Form></section>
    <section style={{marginTop:28}}><h2>Operators</h2>{sessions.map(s=>{const op=qualification.operators.find(o=>o.sessionId===s.id);return <Form key={s.id} method="post" style={{border:"1px solid #ddd",borderRadius:10,padding:14,marginBottom:10}}><input type="hidden" name="targetSessionId" value={s.id}/><p><strong>{s.firstName || s.lastName ? `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() : s.email || s.id}</strong>{s.id===currentSessionId ? " · current session" : ""}{s.accountOwner ? " · Shopify account owner" : ""}</p><label><input type="checkbox" name="canApprove" defaultChecked={op?.canApprove}/> Approve</label>{" "}<label><input type="checkbox" name="canExecute" defaultChecked={op?.canExecute}/> Execute</label>{" "}<label><input type="checkbox" name="canRollback" defaultChecked={op?.canRollback}/> Rollback</label>{" "}<label><input type="checkbox" name="canAdminister" defaultChecked={op?.canAdminister}/> Administer</label>{" "}<label><input type="checkbox" name="active" defaultChecked={op?.active ?? true}/> Active</label><div><button name="intent" value="save_operator" style={{marginTop:10}}>Save Operator</button></div></Form>})}</section>
    <section style={{marginTop:28}}><h2>Security Events</h2>{receipts.length===0?<p>No webhook security events recorded.</p>:receipts.map(r=><article key={r.id} style={{borderBottom:"1px solid #eee",padding:"8px 0"}}><strong>{r.topic}</strong><div><small>{r.processedAt.toISOString()} · correlation {r.correlationId}</small></div></article>)}</section>
    <section style={{marginTop:28,border:"1px solid #b00",borderRadius:10,padding:14}}><h2>Emergency Session Revocation</h2><p>Deletes all Shopify sessions for this shop and forces deployment state to BLOCKED.</p><Form method="post"><button name="intent" value="revoke_sessions">Revoke All Sessions</button></Form></section>
  </main>;
}

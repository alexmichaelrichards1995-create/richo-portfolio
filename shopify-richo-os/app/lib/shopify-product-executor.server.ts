import prisma from "../db.server";
import { assertExecutionAllowed } from "./execution-gate.server";
import type { ProposedAction } from "./richo-control-plane.server";
import { fetchProductState, hashProductState } from "./product-state.server";

type AdminGraphql = (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;

type ProductUpdatePayload = {
  kind: "product_update";
  productId: string;
  title?: string;
  descriptionHtml?: string;
  seo?: { title?: string; description?: string };
};

function isAllowedPayload(value: unknown): value is ProductUpdatePayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return p.kind === "product_update" && typeof p.productId === "string";
}

export async function executeApprovedProductUpdate(args: {
  shopDomain: string;
  actionId: string;
  expectedStateMatches: boolean;
  idempotencyKey: string;
  adminGraphql: AdminGraphql;
}) {
  const row = await prisma.richoShopifyAction.findFirst({
    where: { id: args.actionId, shopDomain: args.shopDomain },
    include: { auditEvents: true },
  });
  if (!row) throw new Error("RICHO_ACTION_NOT_FOUND");
  if (!isAllowedPayload(row.mutationPayload)) throw new Error("RICHO_MUTATION_NOT_ALLOWLISTED");

  const action: ProposedAction = {
    id: row.id,
    agent: row.agent as ProposedAction["agent"],
    title: row.title,
    evidence: row.evidence,
    recommendation: row.recommendation,
    risk: row.risk as ProposedAction["risk"],
    reversible: row.reversible,
    requiresHumanApproval: true,
    status: row.status as ProposedAction["status"],
    createdAt: row.createdAt.toISOString(),
  };

  assertExecutionAllowed({
    action,
    persistedStatus: row.status as "proposed" | "approved" | "rejected" | "executed" | "failed",
    expectedStateMatches: args.expectedStateMatches,
    idempotencyKey: args.idempotencyKey,
    alreadyExecuted: row.auditEvents.some((event) => event.event === "EXECUTED"),
    rollbackPayload: row.rollbackPayload,
  });

  const payload = row.mutationPayload as ProductUpdatePayload;
  const product: Record<string, unknown> = { id: payload.productId };
  if (payload.title !== undefined) product.title = payload.title;
  if (payload.descriptionHtml !== undefined) product.descriptionHtml = payload.descriptionHtml;
  if (payload.seo !== undefined) product.seo = payload.seo;

  const response = await args.adminGraphql(`#graphql
    mutation RichoApprovedProductUpdate($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product { id title updatedAt }
        userErrors { field message }
      }
    }
  `, { variables: { product } });
  const json = await response.json();
  const result = json?.data?.productUpdate;
  const errors = result?.userErrors ?? [];

  if (errors.length > 0) {
    await prisma.richoShopifyAuditEvent.create({
      data: { actionId: row.id, event: "FAILED", actorType: "system", payload: errors },
    });
    await prisma.richoShopifyAction.update({ where: { id: row.id }, data: { status: "failed" } });
    throw new Error(`RICHO_SHOPIFY_MUTATION_FAILED: ${errors.map((e: { message: string }) => e.message).join("; ")}`);
  }

  const verifiedState = await fetchProductState(args.adminGraphql, payload.productId);
  const verifiedHash = hashProductState(verifiedState);
  const seoMatches = payload.seo?.title === undefined || verifiedState.seo?.title === payload.seo.title;
  const titleMatches = payload.title === undefined || verifiedState.title === payload.title;
  const descriptionMatches = payload.descriptionHtml === undefined || verifiedState.descriptionHtml === payload.descriptionHtml;
  const verified = seoMatches && titleMatches && descriptionMatches;

  if (!verified) {
    await prisma.richoShopifyAuditEvent.create({
      data: { actionId: row.id, event: "FAILED", actorType: "system", payload: { reason: "POST_EXECUTION_VERIFICATION_FAILED", verifiedHash } },
    });
    await prisma.richoShopifyAction.update({ where: { id: row.id }, data: { status: "failed" } });
    throw new Error("RICHO_POST_EXECUTION_VERIFICATION_FAILED");
  }

  await prisma.$transaction([
    prisma.richoShopifyAction.update({ where: { id: row.id }, data: { status: "executed", executedAt: new Date() } }),
    prisma.richoShopifyAuditEvent.create({
      data: {
        actionId: row.id,
        event: "EXECUTED",
        actorType: "system",
        payload: { idempotencyKey: args.idempotencyKey, product: result?.product ?? null, verified: true, verifiedHash },
      },
    }),
  ]);

  return { product: result?.product ?? null, verified: true, verifiedHash };
}

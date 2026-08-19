import prisma from "../db.server";
import { fetchProductState, hashProductState } from "./product-state.server";

type AdminGraphql = (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;

type RollbackPayload = {
  kind: "product_update";
  productId: string;
  title?: string;
  descriptionHtml?: string;
  seo?: { title?: string | null; description?: string | null };
};

function isRollbackPayload(value: unknown): value is RollbackPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.kind === "product_update" && typeof v.productId === "string";
}

function restoredStateMatches(rollback: RollbackPayload, state: Awaited<ReturnType<typeof fetchProductState>>) {
  if (rollback.title !== undefined && state.title !== rollback.title) return false;
  if (rollback.descriptionHtml !== undefined && state.descriptionHtml !== rollback.descriptionHtml) return false;
  if (rollback.seo !== undefined) {
    if ((state.seo?.title ?? null) !== (rollback.seo.title ?? null)) return false;
    if ((state.seo?.description ?? null) !== (rollback.seo.description ?? null)) return false;
  }
  return true;
}

export async function rollbackExecutedProductUpdate(args: {
  shopDomain: string;
  actionId: string;
  actorId: string;
  adminGraphql: AdminGraphql;
}) {
  const row = await prisma.richoShopifyAction.findFirst({
    where: { id: args.actionId, shopDomain: args.shopDomain },
    include: { auditEvents: true },
  });
  if (!row) throw new Error("RICHO_ACTION_NOT_FOUND");
  if (row.status !== "executed") throw new Error("RICHO_ROLLBACK_REQUIRES_EXECUTED_ACTION");
  if (!row.auditEvents.some((event) => event.event === "ROLLBACK_APPROVED")) throw new Error("RICHO_ROLLBACK_REQUIRES_HUMAN_APPROVAL");
  if (row.auditEvents.some((event) => event.event === "ROLLED_BACK")) throw new Error("RICHO_ACTION_ALREADY_ROLLED_BACK");
  if (!isRollbackPayload(row.rollbackPayload)) throw new Error("RICHO_ROLLBACK_PAYLOAD_INVALID");

  const rollback = row.rollbackPayload as RollbackPayload;
  const product: Record<string, unknown> = { id: rollback.productId };
  if (rollback.title !== undefined) product.title = rollback.title;
  if (rollback.descriptionHtml !== undefined) product.descriptionHtml = rollback.descriptionHtml;
  if (rollback.seo !== undefined) product.seo = rollback.seo;

  const response = await args.adminGraphql(`#graphql
    mutation RichoRollbackProductUpdate($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product { id title updatedAt }
        userErrors { field message }
      }
    }
  `, { variables: { product } });
  const json = await response.json();
  const result = json?.data?.productUpdate;
  const errors = result?.userErrors ?? [];
  if (errors.length) throw new Error(`RICHO_ROLLBACK_FAILED: ${errors.map((e: {message:string}) => e.message).join("; ")}`);

  const restoredState = await fetchProductState(args.adminGraphql, rollback.productId);
  if (!restoredStateMatches(rollback, restoredState)) {
    await prisma.richoShopifyAuditEvent.create({
      data: {
        actionId: row.id,
        event: "ROLLBACK_VERIFICATION_FAILED",
        actorType: "system",
        evidence: "Rollback mutation returned without Shopify errors but restored state did not match the captured rollback snapshot.",
      },
    });
    throw new Error("RICHO_ROLLBACK_VERIFICATION_FAILED");
  }

  const restoredHash = hashProductState(restoredState);
  await prisma.$transaction([
    prisma.richoShopifyAuditEvent.create({
      data: {
        actionId: row.id,
        event: "ROLLED_BACK",
        actorType: "human",
        actorId: args.actorId,
        evidence: "Approved rollback executed and restored Shopify state verified against the captured rollback snapshot.",
        payload: { product: result?.product ?? null, restoredHash },
      },
    }),
    prisma.richoShopifyAuditEvent.create({
      data: {
        actionId: row.id,
        event: "ROLLBACK_VERIFIED",
        actorType: "system",
        evidence: "Post-rollback verification succeeded.",
        payload: { restoredHash, restoredState },
      },
    }),
  ]);

  return { product: result?.product ?? null, restoredHash, restoredState };
}

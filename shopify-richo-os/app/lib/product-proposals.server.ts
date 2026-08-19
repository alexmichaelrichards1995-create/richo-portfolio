import { hashState, productRollbackSnapshot } from "./state-hash.server";
import { scoreProduct, type ProductSignal } from "./product-intelligence.server";

export type ProductProposalInput = ProductSignal & {
  descriptionHtml: string;
  seo: { title: string | null; description: string | null };
  updatedAt: string;
};

export function buildProductProposal(input: ProductProposalInput) {
  const intelligence = scoreProduct(input);
  if (intelligence.score >= 80 || intelligence.issues.length === 0) return null;

  const mutation: Record<string, unknown> = {
    kind: "product_update",
    productId: input.id,
  };

  if (input.descriptionLength < 250) {
    mutation.descriptionHtml = `${input.descriptionHtml}<p><strong>What you get:</strong> a clearer, evidence-led R.I.C.H.O. Systems offer with defined outcomes, scope, and next steps.</p>`;
  }

  if (Object.keys(mutation).length === 2) return null;

  const currentState = {
    id: input.id,
    title: input.title,
    descriptionHtml: input.descriptionHtml,
    seo: input.seo,
    updatedAt: input.updatedAt,
  };

  return {
    id: `action:product:${input.id}:quality`,
    agent: "catalog" as const,
    title: `Improve product quality: ${input.title}`,
    evidence: `Product intelligence score ${intelligence.score}/100. ${intelligence.issues.join(" ")}`,
    recommendation: intelligence.recommendation,
    risk: "medium" as const,
    reversible: true,
    expectedStateHash: hashState(currentState),
    rollbackPayload: productRollbackSnapshot(currentState),
    mutationPayload: mutation,
  };
}

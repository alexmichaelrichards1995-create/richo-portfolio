import { createHash } from "node:crypto";

export type ProductState = {
  id: string;
  title: string;
  descriptionHtml: string;
  status: string;
  updatedAt: string;
  seo?: { title?: string | null; description?: string | null } | null;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`).join(",")}}`;
}

export function hashProductState(state: ProductState) {
  return createHash("sha256").update(canonicalize(state)).digest("hex");
}

export function rollbackSnapshot(state: ProductState) {
  return {
    kind: "product_update",
    productId: state.id,
    title: state.title,
    descriptionHtml: state.descriptionHtml,
    seo: state.seo ?? undefined,
  };
}

export async function fetchProductState(adminGraphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>, productId: string): Promise<ProductState> {
  const response = await adminGraphql(`#graphql
    query RichoProductState($id: ID!) {
      product(id: $id) {
        id title descriptionHtml status updatedAt
        seo { title description }
      }
    }
  `, { variables: { id: productId } });
  const json = await response.json();
  if (json?.errors?.length) throw new Error(`RICHO_PRODUCT_STATE_QUERY_FAILED: ${json.errors.map((e: { message: string }) => e.message).join("; ")}`);
  const product = json?.data?.product;
  if (!product) throw new Error("RICHO_PRODUCT_NOT_FOUND");
  return product as ProductState;
}

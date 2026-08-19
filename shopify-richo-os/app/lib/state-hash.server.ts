import { createHash } from "node:crypto";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

export function stableJson(value: unknown) {
  return JSON.stringify(stable(value));
}

export function hashState(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export type ProductRollbackSnapshot = {
  id: string;
  title: string;
  descriptionHtml: string;
  seo: { title: string | null; description: string | null };
  updatedAt: string;
};

export function productRollbackSnapshot(product: ProductRollbackSnapshot) {
  return {
    kind: "product_update",
    productId: product.id,
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    seo: product.seo,
    capturedUpdatedAt: product.updatedAt,
  } as const;
}

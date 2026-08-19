import fs from "node:fs";

const mustContain = {
  "app/lib/execution-gate.server.ts": [
    "Persisted human approval is required.",
    "Shopify state changed after the proposal",
    "An idempotency key is required.",
    "This action has already been executed.",
    "A rollback payload is required",
    "Critical-risk actions require",
  ],
  "app/lib/shopify-product-executor.server.ts": [
    "RICHO_MUTATION_NOT_ALLOWLISTED",
    "productUpdate",
    "EXECUTED",
    "FAILED",
  ],
  "app/lib/state-hash.server.ts": ["sha256", "productRollbackSnapshot"],
  "app/lib/product-proposals.server.ts": ["expectedStateHash", "rollbackPayload", "mutationPayload"],
  "app/lib/experiment-ledger.server.ts": [
    "RICHO_EXPERIMENT_COLLISION",
    "confidenceFor",
    "recommendationFor",
    "collect_more_data",
    "rollback",
  ],
  "app/lib/product-experiment-metrics.server.ts": [
    "landing_page_path",
    "product_title",
    "RICHO_PRODUCT_ATTRIBUTION_QUERY_FAILED",
  ],
  "app/lib/shopify-product-rollback.server.ts": ["ROLLED_BACK"],
};

for (const [path, needles] of Object.entries(mustContain)) {
  const text = fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${path} missing required invariant: ${needle}`);
  }
}

console.log("RICHO Shopify control-plane and experiment lifecycle invariants validated.");

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
};

for (const [path, needles] of Object.entries(mustContain)) {
  const text = fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${path} missing required invariant: ${needle}`);
  }
}

console.log("RICHO Shopify control-plane invariants validated.");

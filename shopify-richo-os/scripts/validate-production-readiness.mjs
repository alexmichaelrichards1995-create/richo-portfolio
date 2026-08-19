import fs from "node:fs";

const checks = {
  "app/lib/production-readiness.server.ts": [
    "RICHO_PRODUCTION_APPROVED",
    "SHOPIFY_APP_URL must use HTTPS",
    "read_products",
    "write_products",
    "read_reports",
    "RICHO_PRODUCTION_NOT_READY",
  ],
  "app/lib/shopify-retry.server.ts": [
    "429",
    "maxAttempts",
    "baseDelayMs",
    "RICHO_SHOPIFY_RETRY_EXHAUSTED",
  ],
  "app/routes/health.ts": [
    "SELECT 1",
    "productionReady",
    "Cache-Control",
    "503",
  ],
  "app/shopify.server.ts": ["assertProductionReadiness"],
};

for (const [path, needles] of Object.entries(checks)) {
  const text = fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${path} missing production-readiness invariant: ${needle}`);
  }
}

console.log("RICHO Shopify production-readiness invariants validated.");

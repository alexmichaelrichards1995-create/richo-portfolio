const REQUIRED_ENV = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
  "DATABASE_URL",
  "SCOPES",
] as const;

export type ProductionReadiness = {
  ready: boolean;
  blockers: string[];
};

export function evaluateProductionReadiness(env: NodeJS.ProcessEnv = process.env): ProductionReadiness {
  const blockers: string[] = [];
  for (const key of REQUIRED_ENV) {
    if (!env[key]?.trim()) blockers.push(`Missing required environment variable: ${key}`);
  }

  const appUrl = env.SHOPIFY_APP_URL?.trim();
  if (appUrl && !appUrl.startsWith("https://")) blockers.push("SHOPIFY_APP_URL must use HTTPS.");
  if (appUrl?.includes("example.invalid")) blockers.push("SHOPIFY_APP_URL still uses the placeholder host.");

  const scopes = new Set((env.SCOPES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  for (const scope of ["read_products", "write_products", "read_reports"]) {
    if (!scopes.has(scope)) blockers.push(`Missing required Shopify scope: ${scope}`);
  }

  if (env.NODE_ENV === "production" && env.RICHO_PRODUCTION_APPROVED !== "true") {
    blockers.push("RICHO_PRODUCTION_APPROVED=true is required before production startup.");
  }

  return { ready: blockers.length === 0, blockers };
}

export function assertProductionReadiness(env: NodeJS.ProcessEnv = process.env) {
  const result = evaluateProductionReadiness(env);
  if (!result.ready) throw new Error(`RICHO_PRODUCTION_NOT_READY: ${result.blockers.join(" ")}`);
  return result;
}

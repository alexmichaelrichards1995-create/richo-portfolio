const REQUIRED = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL", "RICHO_DOWNLOAD_SECRET"] as const;

export function assertRuntimeEnv(env: NodeJS.ProcessEnv = process.env) {
  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required runtime configuration: ${missing.join(", ")}`);
  }
  return true;
}

export function isProduction(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production";
}

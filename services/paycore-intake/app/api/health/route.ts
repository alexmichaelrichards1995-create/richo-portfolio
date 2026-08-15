import { checkoutConfigured, configured, json, pingDatabase, readRuntimeEnv, SERVICE, verifyStripeAccount, VERSION, webhookConfigured } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function timeout<T>(promise: Promise<T>, fallback: T, ms = 3500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET() {
  const env = readRuntimeEnv();
  const databaseReachable = env.DATABASE_URL ? await timeout(pingDatabase(env.DATABASE_URL), false) : false;
  const stripe = env.STRIPE_SECRET_KEY
    ? await timeout(verifyStripeAccount(env.STRIPE_SECRET_KEY, env.STRIPE_EXPECTED_ACCOUNT_ID), { ok: false, accountPinned: Boolean(env.STRIPE_EXPECTED_ACCOUNT_ID) })
    : { ok: false, accountPinned: Boolean(env.STRIPE_EXPECTED_ACCOUNT_ID) };

  const checkoutReady = checkoutConfigured(env) && databaseReachable && stripe.ok;
  const webhookReady = webhookConfigured(env) && databaseReachable && stripe.ok;
  const ready = checkoutReady && webhookReady;

  return json({
    service: SERVICE,
    version: VERSION,
    status: ready ? "ready" : "activation_required",
    code_ready: true,
    checkout_ready: checkoutReady,
    webhook_ready: webhookReady,
    database_reachable: databaseReachable,
    webhook_configured: Boolean(env.STRIPE_WEBHOOK_SECRET),
    stripe_mode: env.STRIPE_SECRET_KEY ? (env.STRIPE_SECRET_KEY.startsWith("sk_test_") ? "test" : env.STRIPE_SECRET_KEY.startsWith("sk_live_") ? "live" : "unknown") : "unknown",
    configured: configured(env),
    dependencies: { database: databaseReachable, stripe_api: stripe.ok, stripe_account_pinned: stripe.accountPinned },
    controls: {
      canonical_server_pricing: true,
      raw_webhook_signature_verification: true,
      durable_webhook_idempotency: true,
      encrypted_customer_payloads: true,
      fail_closed_commercial_validation: true,
      bootstrap_script_required: false,
    },
  });
}

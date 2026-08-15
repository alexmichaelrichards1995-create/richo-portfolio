import crypto from "node:crypto";
import { assertStripeAccount, database, json, PayCoreError, requireWebhookEnv, sha256, stripeClient } from "@/lib/runtime";
import { processStripeEvent } from "@/lib/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_WEBHOOK_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  try {
    const env = requireWebhookEnv();
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
      return json({ received: false, error: "webhook_body_too_large", request_id: requestId }, { status: 413 });
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) return json({ received: false, error: "missing_stripe_signature", request_id: requestId }, { status: 400 });

    // Read the exact request body once. Never JSON-parse before Stripe signature verification.
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
      return json({ received: false, error: "webhook_body_too_large", request_id: requestId }, { status: 413 });
    }

    const stripe = stripeClient(env.STRIPE_SECRET_KEY);
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return json({ received: false, error: "invalid_webhook_signature", request_id: requestId }, { status: 400 });
    }

    // Avoid account API calls for untrusted payloads: verify the signature first,
    // then enforce the optional account pin before any Stripe hydration/processing.
    await assertStripeAccount(env.STRIPE_SECRET_KEY, env.STRIPE_EXPECTED_ACCOUNT_ID);
    const outcome = await processStripeEvent({
      stripe,
      sql: database(env.DATABASE_URL),
      event,
      bodyHash: sha256(rawBody),
      piiKey: env.PAYCORE_PII_ENCRYPTION_KEY,
      emailPepper: env.EMAIL_HASH_PEPPER,
    });

    return json({ received: true, request_id: requestId, event_id: event.id, action: outcome.action, duplicate: Boolean(outcome.duplicate) }, { status: 200 });
  } catch (error) {
    const code = error instanceof PayCoreError ? error.code : "webhook_processing_error";
    const retryable = !(error instanceof PayCoreError) || error.retryable;
    console.error("paycore_webhook_failed", { request_id: requestId, code, retryable });
    return json({ received: false, error: code, retryable, request_id: requestId }, { status: retryable ? 500 : (error instanceof PayCoreError ? error.httpStatus : 500) });
  }
}

export async function GET() {
  return json({ received: false, error: "method_not_allowed" }, { status: 405, headers: { allow: "POST" } });
}

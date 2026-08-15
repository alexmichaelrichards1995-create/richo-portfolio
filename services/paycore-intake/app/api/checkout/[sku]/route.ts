import crypto from "node:crypto";
import { checkoutBodySchema, createCheckout } from "@/lib/checkout";
import { database, json, PayCoreError, productFor, requireCheckoutEnv, sha256, stripeClient, trustedOrigins, validIdempotencyKey } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 16 * 1024;

function enforceOrigin(request: Request, allowed: Set<string>) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let normalized: string;
  try { normalized = new URL(origin).origin; } catch { throw new PayCoreError("invalid_origin", { httpStatus: 403 }); }
  if (!allowed.has(normalized)) throw new PayCoreError("origin_not_allowed", { httpStatus: 403 });
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip")?.trim() || null;
}

export async function POST(request: Request, context: { params: Promise<{ sku: string }> }) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  try {
    const env = requireCheckoutEnv();
    enforceOrigin(request, trustedOrigins(env));

    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw new PayCoreError("request_body_too_large", { httpStatus: 413 });
    }

    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) throw new PayCoreError("request_body_too_large", { httpStatus: 413 });

    let decoded: unknown;
    try { decoded = raw ? JSON.parse(raw) : {}; } catch { throw new PayCoreError("invalid_json", { httpStatus: 400 }); }
    const body = checkoutBodySchema.parse(decoded);
    const { sku } = await context.params;
    const product = productFor(sku);

    const suppliedKey = request.headers.get("idempotency-key");
    const key = validIdempotencyKey(suppliedKey);
    if (suppliedKey && !key) throw new PayCoreError("invalid_idempotency_key", { httpStatus: 400 });
    const idempotencyKey = key ?? `server-${crypto.randomUUID()}`;

    const result = await createCheckout({
      stripe: stripeClient(env.STRIPE_SECRET_KEY),
      sql: database(env.DATABASE_URL),
      product,
      body,
      bodyHash: sha256(raw),
      idempotencyKey,
      siteUrl: env.NEXT_PUBLIC_SITE_URL,
      piiKey: env.PAYCORE_PII_ENCRYPTION_KEY,
      emailPepper: env.EMAIL_HASH_PEPPER,
      ip: clientIp(request),
    });

    return json({ ok: true, request_id: requestId, checkout: result }, { status: 201 });
  } catch (error) {
    if (error instanceof PayCoreError) return json({ ok: false, error: error.code, request_id: requestId }, { status: error.httpStatus });
    if (error && typeof error === "object" && "issues" in error) return json({ ok: false, error: "invalid_checkout_body", request_id: requestId }, { status: 400 });
    console.error("paycore_checkout_failed", { request_id: requestId, error_class: error instanceof Error ? error.name : "unknown" });
    return json({ ok: false, error: "checkout_internal_error", request_id: requestId }, { status: 500 });
  }
}

export async function GET() {
  return json({ ok: false, error: "method_not_allowed" }, { status: 405, headers: { allow: "POST" } });
}

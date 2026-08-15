import crypto from "node:crypto";
import { z } from "zod";
import type Stripe from "stripe";
import type { Product, SqlClient } from "./runtime";
import { PayCoreError, encryptJson, hmacHash, normalizeEmail, sha256 } from "./runtime";

export const checkoutBodySchema = z.object({
  email: z.string().trim().email().max(254).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  businessName: z.string().trim().min(1).max(160).optional(),
  consentToTerms: z.literal(true),
}).strict();

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;
export type CheckoutResult = {
  checkoutUrl: string;
  orderReference: string;
  sessionId: string;
  expiresAt: number | null;
  sku: string;
  amountMinor: number;
  currency: "aud";
};

function fingerprint(sku: string, email: string | null, bodyHash: string): string {
  return sha256(`${sku}|${email ?? ""}|${bodyHash}`);
}

async function existingCheckout(sql: SqlClient, key: string, requestFingerprint: string): Promise<CheckoutResult | null> {
  const rows = await sql`
    SELECT request_fingerprint, response
      FROM idempotency_records
     WHERE scope = 'checkout' AND key = ${key}
     LIMIT 1
  ` as unknown as Array<{ request_fingerprint: string | null; response: CheckoutResult }>;
  const row = rows[0];
  if (!row) return null;
  if (row.request_fingerprint && row.request_fingerprint !== requestFingerprint) {
    throw new PayCoreError("idempotency_key_reused_with_different_request", { httpStatus: 409 });
  }
  return row.response;
}

export async function createCheckout(input: {
  stripe: Stripe;
  sql: SqlClient;
  product: Product;
  body: CheckoutBody;
  bodyHash: string;
  idempotencyKey: string;
  siteUrl: string;
  piiKey: string;
  emailPepper: string;
  ip?: string | null;
}): Promise<CheckoutResult> {
  const { stripe, sql, product, body, bodyHash, idempotencyKey, siteUrl, piiKey, emailPepper, ip } = input;
  const email = normalizeEmail(body.email);
  const requestFingerprint = fingerprint(product.sku, email, bodyHash);
  const previous = await existingCheckout(sql, idempotencyKey, requestFingerprint);
  if (previous) return previous;

  const intentId = `pci_${crypto.randomUUID()}`;
  const orderReference = `RICHO-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const encryptedCustomer = encryptJson({ name: body.name ?? null, email, businessName: body.businessName ?? null }, piiKey);
  const emailHash = email ? hmacHash(email, emailPepper) : null;
  const ipHash = ip ? hmacHash(ip, emailPepper) : null;

  await sql`
    INSERT INTO payment_intents (
      id, order_reference, sku, product_name, amount_minor, net_minor, gst_minor,
      tax_mode, currency, billing_type, state, provider, encrypted_customer,
      email_hash, ip_hash, risk, fulfilment_state, metadata
    ) VALUES (
      ${intentId}, ${orderReference}, ${product.sku}, ${product.name},
      ${product.amountMinor}, ${product.amountMinor}, 0,
      'tax_unverified', 'AUD', 'one_time', 'initiated', 'stripe',
      ${JSON.stringify(encryptedCustomer)}::jsonb, ${emailHash}, ${ipHash}, '{}'::jsonb,
      'not_ready', ${JSON.stringify({
        release_version: product.releaseVersion,
        fulfilment_mode: product.fulfilmentMode,
        checkout_request_hash: bodyHash,
        terms_consent: true,
      })}::jsonb
    )
  `;

  let session: Stripe.Checkout.Session;
  try {
    const base = new URL(siteUrl).origin;
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: product.currency,
          unit_amount: product.amountMinor,
          product_data: { name: product.name, metadata: { richo_sku: product.sku, richo_release_version: product.releaseVersion } },
        },
      }],
      customer_email: email ?? undefined,
      client_reference_id: orderReference,
      success_url: `${base}/?checkout=success&order_reference=${encodeURIComponent(orderReference)}`,
      cancel_url: `${base}/?checkout=cancelled&sku=${encodeURIComponent(product.sku)}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      payment_intent_data: { metadata: {
        richo_intent_id: intentId,
        richo_order_reference: orderReference,
        richo_sku: product.sku,
        richo_release_version: product.releaseVersion,
        richo_expected_amount_minor: String(product.amountMinor),
        richo_currency: product.currency,
      } },
      metadata: {
        richo_intent_id: intentId,
        richo_order_reference: orderReference,
        richo_sku: product.sku,
        richo_release_version: product.releaseVersion,
        richo_expected_amount_minor: String(product.amountMinor),
        richo_currency: product.currency,
      },
      billing_address_collection: "auto",
      allow_promotion_codes: false,
    }, { idempotencyKey: `richo-checkout:${idempotencyKey}` });
  } catch (error) {
    await sql`
      UPDATE payment_intents
         SET state = 'checkout_failed', updated_at = now(),
             metadata = metadata || ${JSON.stringify({ checkout_error_class: error instanceof Error ? error.name : "unknown" })}::jsonb
       WHERE id = ${intentId}
    `;
    throw new PayCoreError("stripe_checkout_create_failed", { httpStatus: 502, retryable: true });
  }

  if (!session.url) throw new PayCoreError("stripe_checkout_missing_url", { httpStatus: 502, retryable: true });

  const result: CheckoutResult = {
    checkoutUrl: session.url,
    orderReference,
    sessionId: session.id,
    expiresAt: session.expires_at ?? null,
    sku: product.sku,
    amountMinor: product.amountMinor,
    currency: product.currency,
  };
  const attemptId = `pat_${crypto.randomUUID()}`;

  await sql.transaction([
    sql`UPDATE payment_intents SET state = 'checkout_created', provider_object_id = ${session.id}, updated_at = now() WHERE id = ${intentId} AND state = 'initiated'`,
    sql`INSERT INTO payment_attempts (id, intent_id, provider, state, external_id, checkout_url, provider_status)
        VALUES (${attemptId}, ${intentId}, 'stripe', 'checkout_created', ${session.id}, ${session.url}, ${session.status ?? "open"})
        ON CONFLICT (provider, external_id) DO UPDATE SET state = EXCLUDED.state, checkout_url = EXCLUDED.checkout_url, provider_status = EXCLUDED.provider_status, updated_at = now()`,
    sql`INSERT INTO idempotency_records (scope, key, request_fingerprint, response)
        VALUES ('checkout', ${idempotencyKey}, ${requestFingerprint}, ${JSON.stringify(result)}::jsonb)
        ON CONFLICT (scope, key) DO NOTHING`,
  ]);

  return result;
}

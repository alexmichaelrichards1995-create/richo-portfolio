import crypto from "node:crypto";
import type Stripe from "stripe";
import type { SqlClient } from "./runtime";
import { PayCoreError, encryptJson, hmacHash, normalizeEmail, productFor } from "./runtime";

export type WebhookOutcome = {
  eventId: string;
  eventType: string;
  duplicate?: boolean;
  action: "processed" | "ignored" | "failed_retryable";
  intentId?: string | null;
};

function metadata(meta: Stripe.Metadata | null | undefined, key: string): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// A healthy webhook invocation should complete in seconds. If a worker dies after
// the durable claim but before completion, Stripe redelivery may reclaim that
// event only after this deliberately conservative stale-processing window.
export const WEBHOOK_CLAIM_STALE_MINUTES = 10;

export async function claimEvent(sql: SqlClient, event: Stripe.Event, bodyHash: string): Promise<boolean> {
  const rows = await sql`
    INSERT INTO webhook_receipts (provider, event_id, status, kind, payload)
    VALUES ('stripe', ${event.id}, 'processing', ${event.type}, ${JSON.stringify({
      event_id: event.id,
      event_type: event.type,
      created: event.created,
      livemode: event.livemode,
      body_sha256: bodyHash,
    })}::jsonb)
    ON CONFLICT (provider, event_id) DO UPDATE
      SET status = 'processing', kind = EXCLUDED.kind, last_error = NULL,
          payload = COALESCE(webhook_receipts.payload, '{}'::jsonb) || EXCLUDED.payload ||
            jsonb_build_object('reclaimed_at', now()),
          updated_at = now()
      WHERE webhook_receipts.status = 'failed'
         OR (
           webhook_receipts.status = 'processing'
           AND webhook_receipts.updated_at < now() - interval '10 minutes'
         )
    RETURNING event_id
  ` as unknown as Array<{ event_id: string }>;
  return rows.length === 1;
}

async function markReceipt(
  sql: SqlClient,
  eventId: string,
  status: "processed" | "failed",
  options: { intentId?: string | null; lastError?: string | null; extra?: Record<string, unknown> } = {},
) {
  await sql`
    UPDATE webhook_receipts
       SET status = ${status},
           intent_id = COALESCE(${options.intentId ?? null}, intent_id),
           processed_at = CASE WHEN ${status} = 'processed' THEN now() ELSE processed_at END,
           last_error = ${options.lastError ?? null},
           payload = COALESCE(payload, '{}'::jsonb) || ${JSON.stringify(options.extra ?? {})}::jsonb,
           updated_at = now()
     WHERE provider = 'stripe' AND event_id = ${eventId}
  `;
}

async function processPaidCheckout(input: {
  stripe: Stripe;
  sql: SqlClient;
  event: Stripe.Event;
  session: Stripe.Checkout.Session;
  piiKey: string;
  emailPepper: string;
}): Promise<WebhookOutcome> {
  const { stripe, sql, event, piiKey, emailPepper } = input;
  const hydrated = await stripe.checkout.sessions.retrieve(input.session.id, { expand: ["payment_intent"] });
  const lineItems = await stripe.checkout.sessions.listLineItems(input.session.id, { limit: 10, expand: ["data.price.product"] });

  const intentId = metadata(hydrated.metadata, "richo_intent_id");
  const orderReference = metadata(hydrated.metadata, "richo_order_reference");
  const sku = metadata(hydrated.metadata, "richo_sku");
  const expectedAmount = metadata(hydrated.metadata, "richo_expected_amount_minor");
  const expectedCurrency = metadata(hydrated.metadata, "richo_currency");
  if (!intentId || !orderReference || !sku) throw new PayCoreError("missing_richo_checkout_metadata", { httpStatus: 200 });

  const product = productFor(sku);
  if (expectedAmount !== String(product.amountMinor) || expectedCurrency?.toLowerCase() !== product.currency) {
    throw new PayCoreError("metadata_commercial_terms_mismatch", { httpStatus: 200 });
  }

  const intentRows = await sql`
    SELECT id, order_reference, sku, amount_minor, currency, state
      FROM payment_intents WHERE id = ${intentId} LIMIT 1
  ` as unknown as Array<{ id: string; order_reference: string; sku: string; amount_minor: string | number; currency: string; state: string }>;
  const intent = intentRows[0];
  if (!intent) throw new PayCoreError("intent_not_found", { httpStatus: 200 });
  if (intent.order_reference !== orderReference || intent.sku !== sku || Number(intent.amount_minor) !== product.amountMinor || intent.currency.toUpperCase() !== "AUD") {
    throw new PayCoreError("intent_commercial_terms_mismatch", { httpStatus: 200 });
  }
  if (!["initiated", "checkout_created", "processing", "payment_pending", "succeeded"].includes(intent.state)) {
    throw new PayCoreError("illegal_payment_state_transition", { httpStatus: 200 });
  }

  if (hydrated.payment_status !== "paid" || hydrated.currency?.toLowerCase() !== product.currency || hydrated.amount_total !== product.amountMinor) {
    throw new PayCoreError("stripe_paid_session_validation_failed", { httpStatus: 200 });
  }
  if (hydrated.client_reference_id !== orderReference || lineItems.has_more || lineItems.data.length !== 1) {
    throw new PayCoreError("stripe_checkout_identity_validation_failed", { httpStatus: 200 });
  }
  const line = lineItems.data[0];
  if (line.quantity !== 1 || line.amount_total !== product.amountMinor) {
    throw new PayCoreError("stripe_line_item_validation_failed", { httpStatus: 200 });
  }

  const paymentIntent = hydrated.payment_intent;
  const providerPaymentIntentId = typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null;
  if (paymentIntent && typeof paymentIntent === "object" && paymentIntent.status !== "succeeded") {
    throw new PayCoreError("stripe_payment_intent_not_succeeded", { httpStatus: 200 });
  }

  const email = normalizeEmail(hydrated.customer_details?.email ?? hydrated.customer_email);
  const encryptedCustomer = encryptJson({
    name: hydrated.customer_details?.name ?? null,
    email,
    phone: hydrated.customer_details?.phone ?? null,
    address: hydrated.customer_details?.address ?? null,
  }, piiKey);
  const emailHash = email ? hmacHash(email, emailPepper) : null;
  const attemptId = `pat_${crypto.randomUUID()}`;

  const promoted = await sql`
    UPDATE payment_intents
       SET state = 'succeeded', provider = 'stripe', provider_object_id = ${hydrated.id},
           provider_payment_intent_id = ${providerPaymentIntentId}, encrypted_customer = ${JSON.stringify(encryptedCustomer)}::jsonb,
           email_hash = COALESCE(${emailHash}, email_hash), fulfilment_state = 'ready_to_stage',
           succeeded_at = COALESCE(succeeded_at, now()), updated_at = now(),
           metadata = metadata || ${JSON.stringify({
             stripe_checkout_session_id: hydrated.id,
             stripe_payment_status: hydrated.payment_status,
             stripe_event_id: event.id,
             stripe_livemode: event.livemode,
             verified_amount_minor: product.amountMinor,
             verified_currency: product.currency,
           })}::jsonb
     WHERE id = ${intentId} AND order_reference = ${orderReference} AND sku = ${sku}
       AND amount_minor = ${product.amountMinor} AND upper(currency::text) = 'AUD'
       AND state IN ('initiated','checkout_created','processing','payment_pending','succeeded')
     RETURNING id
  ` as unknown as Array<{ id: string }>;
  if (promoted.length !== 1) throw new PayCoreError("atomic_payment_promotion_failed", { httpStatus: 200 });

  await sql.transaction([
    sql`INSERT INTO payment_attempts (id, intent_id, provider, state, external_id, provider_status)
        VALUES (${attemptId}, ${intentId}, 'stripe', 'succeeded', ${hydrated.id}, ${hydrated.payment_status})
        ON CONFLICT (provider, external_id) DO UPDATE SET state = 'succeeded', provider_status = EXCLUDED.provider_status, updated_at = now()`,
    sql`UPDATE webhook_receipts SET status = 'processed', intent_id = ${intentId}, processed_at = now(), last_error = NULL,
        payload = COALESCE(payload, '{}'::jsonb) || ${JSON.stringify({ outcome: "verified_paid_checkout", sku, order_reference: orderReference, amount_minor: product.amountMinor, currency: product.currency })}::jsonb,
        updated_at = now() WHERE provider = 'stripe' AND event_id = ${event.id}`,
  ]);

  return { eventId: event.id, eventType: event.type, action: "processed", intentId };
}

export async function processStripeEvent(input: {
  stripe: Stripe;
  sql: SqlClient;
  event: Stripe.Event;
  bodyHash: string;
  piiKey: string;
  emailPepper: string;
}): Promise<WebhookOutcome> {
  const { stripe, sql, event, bodyHash, piiKey, emailPepper } = input;
  const claimed = await claimEvent(sql, event, bodyHash);
  if (!claimed) return { eventId: event.id, eventType: event.type, action: "ignored", duplicate: true };

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      return await processPaidCheckout({ stripe, sql, event, session: event.data.object as Stripe.Checkout.Session, piiKey, emailPepper });
    }

    if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const intentId = metadata(session.metadata, "richo_intent_id");
      if (intentId) {
        await sql`UPDATE payment_intents SET state = ${event.type === "checkout.session.expired" ? "checkout_expired" : "payment_failed"},
          fulfilment_state = 'blocked_payment_not_succeeded', updated_at = now()
          WHERE id = ${intentId} AND state <> 'succeeded'`;
      }
      await markReceipt(sql, event.id, "processed", { intentId, extra: { outcome: event.type } });
      return { eventId: event.id, eventType: event.type, action: "processed", intentId };
    }

    await markReceipt(sql, event.id, "processed", { extra: { outcome: "ignored_event_type" } });
    return { eventId: event.id, eventType: event.type, action: "ignored" };
  } catch (error) {
    const code = error instanceof PayCoreError ? error.code : "webhook_processing_error";
    const retryable = !(error instanceof PayCoreError) || error.retryable;
    await markReceipt(sql, event.id, retryable ? "failed" : "processed", { lastError: code, extra: { outcome: code } });
    if (retryable) throw error;
    return { eventId: event.id, eventType: event.type, action: "ignored" };
  }
}

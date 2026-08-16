import crypto from 'node:crypto';
import Stripe from 'stripe';
import pg from 'pg';
import { loadConfig, OFFERS, OFFERS_BY_SKU, publicOffers } from './config';

const { Pool } = pg;
const stripe = new Stripe('sk_test_placeholder');
const IDEMPOTENCY_SCOPE = 'stripe_payment_link_checkout';
let pool;

function config() {
  return loadConfig(process.env);
}

function database() {
  if (!pool) {
    pool = new Pool({
      connectionString: config().databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
  }
  return pool;
}

function internalId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function orderReference() {
  return `RCHO-${crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
}

function validateIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(key)) {
    const error = new Error('A valid Idempotency-Key header is required');
    error.code = 'INVALID_IDEMPOTENCY_KEY';
    throw error;
  }
  return key;
}

function priceBreakdown(offer, runtime) {
  if (!runtime.gstRegistered) {
    return {
      amountMinor: offer.amountMinor,
      netMinor: offer.amountMinor,
      gstMinor: 0,
      taxMode: 'not_registered',
    };
  }

  const gstMinor = Math.round(offer.amountMinor / 11);
  return {
    amountMinor: offer.amountMinor,
    netMinor: offer.amountMinor - gstMinor,
    gstMinor,
    taxMode: 'gst_inclusive',
  };
}

function fingerprint(offer, price, runtime) {
  return crypto.createHash('sha256').update(JSON.stringify({
    version: 3,
    sku: offer.sku,
    amountMinor: price.amountMinor,
    currency: offer.currency,
    taxMode: price.taxMode,
    gstMinor: price.gstMinor,
    paymentMode: runtime.mode,
  })).digest('hex');
}

function checkoutUrl(offer, intentId, runtime) {
  const link = runtime.links[offer.slug];
  const url = new URL(link.url);
  url.searchParams.set('client_reference_id', intentId);
  return { url: url.toString(), paymentLinkId: link.id };
}

async function withLock(client, key) {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    [IDEMPOTENCY_SCOPE, key],
  );
}

export async function startCheckout(slug, idempotencyKey) {
  const runtime = config();
  const offer = OFFERS[String(slug || '').trim().toLowerCase()];
  if (!offer) {
    const error = new Error('Unknown checkout offer');
    error.code = 'UNKNOWN_SKU';
    throw error;
  }

  const key = validateIdempotencyKey(idempotencyKey);
  const price = priceBreakdown(offer, runtime);
  const requestFingerprint = fingerprint(offer, price, runtime);
  const db = database();
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await withLock(client, key);

    const existing = await client.query(
      `SELECT request_fingerprint, response
       FROM idempotency_records
       WHERE scope=$1 AND key=$2`,
      [IDEMPOTENCY_SCOPE, key],
    );

    if (existing.rowCount) {
      const storedFingerprint = String(existing.rows[0].request_fingerprint || '').trim();
      if (storedFingerprint !== requestFingerprint) {
        const error = new Error('Idempotency key was already used for another request');
        error.code = 'IDEMPOTENCY_CONFLICT';
        throw error;
      }
      await client.query('COMMIT');
      return { ...existing.rows[0].response, reused: true };
    }

    const intentId = internalId('pci');
    const attemptId = internalId('pca');
    const orderRef = orderReference();
    const paymentLink = checkoutUrl(offer, intentId, runtime);
    const livemode = runtime.mode === 'live';

    await client.query(
      `INSERT INTO payment_intents (
        id, order_reference, sku, product_name, amount_minor, net_minor, gst_minor,
        tax_mode, currency, billing_type, state, provider, fulfilment_state,
        metadata, livemode
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,'one_time','checkout_created','stripe','pending',$10::jsonb,$11
      )`,
      [
        intentId,
        orderRef,
        offer.sku,
        offer.name,
        price.amountMinor,
        price.netMinor,
        price.gstMinor,
        price.taxMode,
        offer.currency,
        JSON.stringify({
          checkout_version: 3,
          payment_link_id: paymentLink.paymentLinkId,
          offer_slug: offer.slug,
          fulfilment_type: offer.fulfilment,
          payment_mode: runtime.mode,
        }),
        livemode,
      ],
    );

    await client.query(
      `INSERT INTO payment_attempts (
        id, intent_id, provider, state, external_id, checkout_url, provider_status
      ) VALUES ($1,$2,'stripe','checkout_created',NULL,$3,'open')`,
      [attemptId, intentId, paymentLink.url],
    );

    const response = {
      status: 'checkout_created',
      intent_id: intentId,
      attempt_id: attemptId,
      order_reference: orderRef,
      checkout_url: paymentLink.url,
      sku: offer.sku,
      amount_minor: price.amountMinor,
      currency: offer.currency,
      payment_mode: runtime.mode,
    };

    await client.query(
      `INSERT INTO idempotency_records (scope,key,request_fingerprint,response)
       VALUES ($1,$2,$3,$4::jsonb)`,
      [IDEMPOTENCY_SCOPE, key, requestFingerprint, JSON.stringify(response)],
    );

    await client.query('COMMIT');
    return { ...response, reused: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function updateReceipt(eventId, status, intentId = null, extra = {}) {
  const lastError = status === 'failed'
    ? String(extra.error || 'processing_failed').slice(0, 500)
    : null;

  await database().query(
    `UPDATE webhook_receipts
     SET status=$2,
         intent_id=$3,
         processed_at=CASE WHEN $2='processed' THEN now() ELSE processed_at END,
         updated_at=now(),
         last_error=$4,
         payload=COALESCE(payload,'{}'::jsonb) || $5::jsonb
     WHERE provider='stripe' AND event_id=$1`,
    [eventId, status, intentId, lastError, JSON.stringify(extra)],
  );
}

async function emitLiveRevenue(intent, session, event, runtime) {
  if (runtime.mode !== 'live' || !event.livemode) return { skipped: 'not_live' };
  if (!runtime.posthogProjectToken) throw new Error('POSTHOG_PROJECT_TOKEN is required in live mode');

  const checkpointKey = `analytics:posthog:purchase:${session.id}`;
  const db = database();
  const checkpoint = await db.query('SELECT value FROM paycore_kv WHERE key=$1', [checkpointKey]);
  if (checkpoint.rowCount) return { skipped: 'already_sent' };

  const uuidBytes = crypto
    .createHash('sha256')
    .update(`stripe:${session.id}`)
    .digest()
    .subarray(0, 16);
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50;
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;
  const hex = uuidBytes.toString('hex');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

  const response = await fetch(`${runtime.posthogHost}/i/v0/e/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: runtime.posthogProjectToken,
      event: 'richo_purchase_completed',
      uuid,
      timestamp: new Date(Number(event.created) * 1000).toISOString(),
      properties: {
        distinct_id: `paycore:${intent.id}`,
        site: 'richo-paycore',
        sku: intent.sku,
        order_reference: intent.order_reference,
        amount_minor: Number(intent.amount_minor),
        currency: String(intent.currency).trim().toUpperCase(),
        payment_provider: 'stripe',
        checkout_session_id: session.id,
        livemode: true,
      },
    }),
  });

  if (!response.ok) throw new Error(`PostHog returned ${response.status}`);

  await db.query(
    `INSERT INTO paycore_kv(key,value,updated_at)
     VALUES ($1,$2::jsonb,now())
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=now()`,
    [checkpointKey, JSON.stringify({ sent: true, event_uuid: uuid, sent_at: new Date().toISOString() })],
  );

  return { sent: true };
}

export async function processStripeEvent(event) {
  const runtime = config();
  const expectedLivemode = runtime.mode === 'live';
  if (Boolean(event?.livemode) !== expectedLivemode) {
    throw new Error('Stripe event mode does not match PayCore payment mode');
  }

  const supported = new Set([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'checkout.session.expired',
  ]);
  if (!supported.has(event.type)) return { status: 'ignored' };

  const session = event.data?.object;
  if (!session?.id) throw new Error('Checkout Session is missing');
  const db = database();

  const inserted = await db.query(
    `INSERT INTO webhook_receipts(
      provider,event_id,status,kind,received_at,updated_at,payload
    ) VALUES('stripe',$1,'processing',$2,now(),now(),$3::jsonb)
    ON CONFLICT(provider,event_id) DO NOTHING
    RETURNING event_id`,
    [event.id, event.type, JSON.stringify({
      object_id: session.id,
      livemode: Boolean(event.livemode),
      payment_status: session.payment_status || null,
    })],
  );

  if (!inserted.rowCount) {
    const existing = await db.query(
      `SELECT status FROM webhook_receipts
       WHERE provider='stripe' AND event_id=$1`,
      [event.id],
    );
    if (existing.rows[0]?.status === 'processed') return { status: 'duplicate' };
    await db.query(
      `UPDATE webhook_receipts
       SET status='processing', updated_at=now(), last_error=NULL
       WHERE provider='stripe' AND event_id=$1`,
      [event.id],
    );
  }

  const intentId = String(session.client_reference_id || '');
  if (!intentId) {
    await updateReceipt(event.id, 'processed', null, { ignored_reason: 'missing_client_reference_id' });
    return { status: 'ignored', reason: 'missing_client_reference_id' };
  }

  const intentResult = await db.query(
    `SELECT id,order_reference,sku,amount_minor,currency,provider_object_id,livemode
     FROM payment_intents WHERE id=$1`,
    [intentId],
  );
  if (!intentResult.rowCount) throw new Error('PayCore intent not found');
  const intent = intentResult.rows[0];
  const offer = OFFERS_BY_SKU.get(intent.sku);
  if (!offer) throw new Error('PayCore SKU is not approved');
  if (Boolean(intent.livemode) !== expectedLivemode) throw new Error('PayCore intent mode mismatch');

  const expectedPaymentLink = runtime.links[offer.slug].id;
  if (String(session.payment_link || '') !== expectedPaymentLink) {
    throw new Error('Stripe Payment Link does not match PayCore offer');
  }

  if (['checkout.session.async_payment_failed', 'checkout.session.expired'].includes(event.type)) {
    const state = event.type.endsWith('expired') ? 'checkout_expired' : 'payment_failed';
    await db.query(
      `UPDATE payment_intents SET state=$2, updated_at=now()
       WHERE id=$1 AND succeeded_at IS NULL`,
      [intentId, state],
    );
    await db.query(
      `UPDATE payment_attempts
       SET state=$2, external_id=$3, provider_status=$4, updated_at=now()
       WHERE intent_id=$1`,
      [intentId, state, session.id, session.payment_status || null],
    );
    await updateReceipt(event.id, 'processed', intentId, { verified_non_success: true });
    return { status: 'processed', payment: 'not_succeeded' };
  }

  if (session.payment_status !== 'paid') {
    await updateReceipt(event.id, 'processed', intentId, { ignored_reason: 'payment_not_paid' });
    return { status: 'ignored', reason: 'payment_not_paid' };
  }

  if (
    Number(session.amount_total) !== Number(intent.amount_minor) ||
    String(session.currency || '').toUpperCase() !== String(intent.currency).trim().toUpperCase()
  ) {
    throw new Error('Stripe amount or currency does not match PayCore intent');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT provider_object_id FROM payment_intents WHERE id=$1 FOR UPDATE`,
      [intentId],
    );
    if (
      locked.rows[0].provider_object_id &&
      locked.rows[0].provider_object_id !== session.id
    ) {
      throw new Error('PayCore intent is already mapped to another Checkout Session');
    }

    await client.query(
      `UPDATE payment_intents
       SET state='succeeded',
           provider='stripe',
           provider_object_id=$2,
           provider_payment_intent_id=$3,
           livemode=$4,
           succeeded_at=COALESCE(succeeded_at,to_timestamp($5)),
           updated_at=now()
       WHERE id=$1`,
      [
        intentId,
        session.id,
        session.payment_intent ? String(session.payment_intent) : null,
        expectedLivemode,
        Number(event.created),
      ],
    );

    await client.query(
      `UPDATE payment_attempts
       SET state='succeeded', external_id=$2, provider_status='paid',
           error_code=NULL, updated_at=now()
       WHERE intent_id=$1`,
      [intentId, session.id],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await emitLiveRevenue(intent, session, event, runtime);
  await updateReceipt(event.id, 'processed', intentId, {
    verified_paid: true,
    sandbox_excluded_from_revenue: runtime.mode === 'sandbox',
  });

  return {
    status: 'processed',
    payment: runtime.mode === 'live' ? 'live_verified' : 'sandbox_verified',
  };
}

export async function parseAndProcessWebhook(rawBody, signature) {
  const runtime = config();
  const event = stripe.webhooks.constructEvent(rawBody, signature, runtime.webhookSecret);
  try {
    return await processStripeEvent(event);
  } catch (error) {
    await updateReceipt(event.id, 'failed', null, { error: error.message }).catch(() => {});
    throw error;
  }
}

export async function readiness() {
  let runtime;
  try {
    runtime = config();
  } catch (error) {
    return { ok: false, stage: 'configuration', error: 'configuration_incomplete' };
  }

  if (runtime.mode === 'live' && !runtime.posthogProjectToken) {
    return { ok: false, stage: 'configuration', error: 'posthog_required_for_live_mode' };
  }

  try {
    const result = await database().query(`
      SELECT
        to_regclass('public.payment_intents') AS payment_intents,
        to_regclass('public.payment_attempts') AS payment_attempts,
        to_regclass('public.webhook_receipts') AS webhook_receipts,
        to_regclass('public.paycore_kv') AS paycore_kv,
        to_regclass('public.idempotency_records') AS idempotency_records,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name='payment_intents'
            AND column_name='livemode'
        ) AS livemode_column
    `);
    const row = result.rows[0] || {};
    const ok = Boolean(
      row.payment_intents && row.payment_attempts && row.webhook_receipts &&
      row.paycore_kv && row.idempotency_records && row.livemode_column
    );
    return {
      ok,
      stage: ok ? 'ready' : 'schema',
      database: 'reachable',
      schema: ok ? 'paycore-v3' : 'incomplete',
      mode: runtime.mode,
    };
  } catch (error) {
    return {
      ok: false,
      stage: 'database',
      database: 'unreachable',
      schema: 'unknown',
      mode: runtime.mode,
    };
  }
}

export { publicOffers };

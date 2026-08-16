'use strict';

const crypto = require('crypto');
const Stripe = require('stripe');
const { Pool } = require('pg');
const { getOffer, priceBreakdown } = require('./paycore_offer_catalog');

const IDEMPOTENCY_SCOPE = 'stripe_checkout';
let defaultPool;

function getPool() {
  if (!process.env.DATABASE_URL) throw configurationError('DATABASE_URL is required');
  if (!defaultPool) defaultPool = new Pool({ connectionString: process.env.DATABASE_URL });
  return defaultPool;
}

function configurationError(message) {
  const error = new Error(message);
  error.code = 'CHECKOUT_CONFIGURATION_ERROR';
  return error;
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

function checkoutFingerprint(offer, price) {
  return crypto.createHash('sha256').update(JSON.stringify({
    version: 1,
    sku: offer.sku,
    amountMinor: price.amountMinor,
    currency: offer.currency,
    taxMode: price.taxMode,
    gstMinor: price.gstMinor,
  })).digest('hex');
}

function createInternalId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function createOrderReference() {
  return `RCHO-${crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
}

function checkoutBaseUrl(env = process.env) {
  const raw = String(env.CHECKOUT_BASE_URL || '').trim();
  if (!raw) throw configurationError('CHECKOUT_BASE_URL is required');
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    throw configurationError('CHECKOUT_BASE_URL must be a valid URL');
  }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw configurationError('CHECKOUT_BASE_URL must use https outside local development');
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function stripeModeFromKey(value) {
  const key = String(value || '');
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  return 'unknown';
}

function assertStripeMode(env = process.env) {
  const key = String(env.STRIPE_API_KEY || '').trim();
  if (!key) throw configurationError('STRIPE_API_KEY is required');
  const mode = stripeModeFromKey(key);
  if (mode === 'unknown') throw configurationError('STRIPE_API_KEY mode could not be verified');
  if (mode === 'live' && env.ALLOW_LIVE_STRIPE !== 'true') {
    const error = new Error('Live Stripe checkout is not authorized');
    error.code = 'LIVE_STRIPE_NOT_AUTHORIZED';
    throw error;
  }
  return { key, mode };
}

function safeStripeErrorCode(error) {
  const raw = error && (error.code || error.type || error.name);
  return String(raw || 'stripe_checkout_error').slice(0, 120);
}

async function withCheckoutLock(client, idempotencyKey) {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    [IDEMPOTENCY_SCOPE, idempotencyKey],
  );
}

function normalizeStoredResponse(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function loadOrCreateCheckoutDraft({ pool, idempotencyKey, fingerprint, offer, price }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await withCheckoutLock(client, idempotencyKey);

    const existing = await client.query(
      `SELECT request_fingerprint, response
       FROM idempotency_records
       WHERE scope = $1 AND key = $2`,
      [IDEMPOTENCY_SCOPE, idempotencyKey],
    );

    if (existing.rowCount) {
      const storedFingerprint = String(existing.rows[0].request_fingerprint || '').trim();
      if (storedFingerprint !== fingerprint) {
        const error = new Error('Idempotency key was already used for a different checkout request');
        error.code = 'IDEMPOTENCY_CONFLICT';
        throw error;
      }
      const response = normalizeStoredResponse(existing.rows[0].response);
      if (!response.intent_id || !response.attempt_id || !response.order_reference) {
        const error = new Error('Stored checkout idempotency record is incomplete');
        error.code = 'IDEMPOTENCY_RECORD_INVALID';
        throw error;
      }
      await client.query('COMMIT');
      return {
        reused: true,
        status: response.status || 'processing',
        intentId: response.intent_id,
        attemptId: response.attempt_id,
        orderReference: response.order_reference,
        sessionId: response.session_id || null,
        checkoutUrl: response.checkout_url || null,
        expiresAt: response.expires_at || null,
      };
    }

    const intentId = createInternalId('pci');
    const attemptId = createInternalId('pca');
    const orderReference = createOrderReference();
    const metadata = {
      checkout_version: 1,
      fulfilment_type: offer.fulfilmentType,
      tax_mode: price.taxMode,
      source: 'richo_web_checkout',
    };

    await client.query(
      `INSERT INTO payment_intents (
        id, order_reference, sku, product_name, amount_minor, net_minor, gst_minor,
        tax_mode, currency, billing_type, state, provider, fulfilment_state, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'checkout_creating','stripe','pending',$11::jsonb)`,
      [
        intentId,
        orderReference,
        offer.sku,
        offer.name,
        price.amountMinor,
        price.netMinor,
        price.gstMinor,
        price.taxMode,
        offer.currency,
        offer.billingType,
        JSON.stringify(metadata),
      ],
    );

    await client.query(
      `INSERT INTO payment_attempts (
        id, intent_id, provider, state, external_id, provider_status
      ) VALUES ($1,$2,'stripe','creating_checkout',NULL,'creating')`,
      [attemptId, intentId],
    );

    const response = {
      status: 'processing',
      intent_id: intentId,
      attempt_id: attemptId,
      order_reference: orderReference,
      sku: offer.sku,
    };

    await client.query(
      `INSERT INTO idempotency_records (scope, key, request_fingerprint, response)
       VALUES ($1,$2,$3,$4::jsonb)`,
      [IDEMPOTENCY_SCOPE, idempotencyKey, fingerprint, JSON.stringify(response)],
    );

    await client.query('COMMIT');
    return {
      reused: false,
      status: 'processing',
      intentId,
      attemptId,
      orderReference,
      sessionId: null,
      checkoutUrl: null,
      expiresAt: null,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function buildStripeSessionParams({ offer, price, draft, baseUrl }) {
  const metadata = {
    paycore_intent_id: draft.intentId,
    paycore_attempt_id: draft.attemptId,
    order_reference: draft.orderReference,
    sku: offer.sku,
    tax_mode: price.taxMode,
    gst_minor: String(price.gstMinor),
    net_minor: String(price.netMinor),
  };

  return {
    mode: 'payment',
    client_reference_id: draft.intentId,
    line_items: [
      {
        price_data: {
          currency: offer.currency.toLowerCase(),
          unit_amount: price.amountMinor,
          product_data: {
            name: offer.name,
            description: offer.description,
          },
        },
        quantity: 1,
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    success_url: `${baseUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?payment=cancelled&intent_id=${encodeURIComponent(draft.intentId)}`,
  };
}

async function finalizeCheckout({ pool, idempotencyKey, fingerprint, draft, session }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await withCheckoutLock(client, idempotencyKey);

    const existing = await client.query(
      `SELECT request_fingerprint, response
       FROM idempotency_records
       WHERE scope=$1 AND key=$2
       FOR UPDATE`,
      [IDEMPOTENCY_SCOPE, idempotencyKey],
    );
    if (!existing.rowCount) throw new Error('Checkout idempotency record disappeared');
    if (String(existing.rows[0].request_fingerprint || '').trim() !== fingerprint) {
      const error = new Error('Idempotency fingerprint changed during checkout');
      error.code = 'IDEMPOTENCY_CONFLICT';
      throw error;
    }

    const stored = normalizeStoredResponse(existing.rows[0].response);
    if (stored.status === 'checkout_created' && stored.checkout_url) {
      await client.query('COMMIT');
      return {
        status: 'checkout_created',
        reused: true,
        intentId: stored.intent_id,
        attemptId: stored.attempt_id,
        orderReference: stored.order_reference,
        sessionId: stored.session_id,
        checkoutUrl: stored.checkout_url,
        expiresAt: stored.expires_at || null,
      };
    }

    await client.query(
      `UPDATE payment_intents
       SET state='checkout_created',
           provider='stripe',
           provider_object_id=$2,
           updated_at=now()
       WHERE id=$1`,
      [draft.intentId, session.id],
    );

    await client.query(
      `UPDATE payment_attempts
       SET state='checkout_created',
           external_id=$2,
           checkout_url=$3,
           provider_status=$4,
           error_code=NULL,
           updated_at=now()
       WHERE id=$1`,
      [draft.attemptId, session.id, session.url, session.status || 'open'],
    );

    const response = {
      status: 'checkout_created',
      intent_id: draft.intentId,
      attempt_id: draft.attemptId,
      order_reference: draft.orderReference,
      session_id: session.id,
      checkout_url: session.url,
      expires_at: session.expires_at || null,
    };

    await client.query(
      `UPDATE idempotency_records
       SET response=$3::jsonb
       WHERE scope=$1 AND key=$2`,
      [IDEMPOTENCY_SCOPE, idempotencyKey, JSON.stringify(response)],
    );

    await client.query('COMMIT');
    return {
      status: 'checkout_created',
      reused: draft.reused,
      intentId: draft.intentId,
      attemptId: draft.attemptId,
      orderReference: draft.orderReference,
      sessionId: session.id,
      checkoutUrl: session.url,
      expiresAt: session.expires_at || null,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function recordCheckoutFailure({ pool, idempotencyKey, fingerprint, draft, error }) {
  const client = await pool.connect();
  const errorCode = safeStripeErrorCode(error);
  try {
    await client.query('BEGIN');
    await withCheckoutLock(client, idempotencyKey);
    const existing = await client.query(
      `SELECT request_fingerprint, response
       FROM idempotency_records
       WHERE scope=$1 AND key=$2
       FOR UPDATE`,
      [IDEMPOTENCY_SCOPE, idempotencyKey],
    );
    if (!existing.rowCount || String(existing.rows[0].request_fingerprint || '').trim() !== fingerprint) {
      await client.query('ROLLBACK');
      return;
    }
    const stored = normalizeStoredResponse(existing.rows[0].response);
    if (stored.status === 'checkout_created') {
      await client.query('COMMIT');
      return;
    }

    await client.query(
      `UPDATE payment_attempts
       SET state='checkout_failed', provider_status='error', error_code=$2, updated_at=now()
       WHERE id=$1`,
      [draft.attemptId, errorCode],
    );
    await client.query(
      `UPDATE payment_intents
       SET state='checkout_retryable', updated_at=now()
       WHERE id=$1 AND succeeded_at IS NULL`,
      [draft.intentId],
    );
    await client.query(
      `UPDATE idempotency_records
       SET response=$3::jsonb
       WHERE scope=$1 AND key=$2`,
      [IDEMPOTENCY_SCOPE, idempotencyKey, JSON.stringify({
        status: 'retryable_error',
        intent_id: draft.intentId,
        attempt_id: draft.attemptId,
        order_reference: draft.orderReference,
        error_code: errorCode,
      })],
    );
    await client.query('COMMIT');
  } catch (_) {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
}

async function startCheckout({
  sku,
  idempotencyKey,
  env = process.env,
  pool = getPool(),
  stripeClient = null,
} = {}) {
  const offer = getOffer(sku);
  if (!offer) {
    const error = new Error('Unknown checkout SKU');
    error.code = 'UNKNOWN_SKU';
    throw error;
  }

  const key = validateIdempotencyKey(idempotencyKey);
  const price = priceBreakdown(offer, env);
  const baseUrl = checkoutBaseUrl(env);
  const stripeMode = assertStripeMode(env);
  const fingerprint = checkoutFingerprint(offer, price);

  const draft = await loadOrCreateCheckoutDraft({
    pool,
    idempotencyKey: key,
    fingerprint,
    offer,
    price,
  });

  if (draft.status === 'checkout_created' && draft.checkoutUrl) {
    return { ...draft, offer, price, stripeMode: stripeMode.mode };
  }

  const stripe = stripeClient || Stripe(stripeMode.key);
  const params = buildStripeSessionParams({ offer, price, draft, baseUrl });
  let session;
  try {
    session = await stripe.checkout.sessions.create(
      params,
      { idempotencyKey: `paycore_checkout_${draft.intentId}` },
    );
    if (!session || !session.id || !session.url) {
      const error = new Error('Stripe Checkout Session response was incomplete');
      error.code = 'STRIPE_SESSION_INCOMPLETE';
      throw error;
    }
    if (session.livemode && env.ALLOW_LIVE_STRIPE !== 'true') {
      const error = new Error('Stripe returned a live-mode Checkout Session without authorization');
      error.code = 'LIVE_STRIPE_NOT_AUTHORIZED';
      throw error;
    }
  } catch (error) {
    await recordCheckoutFailure({
      pool,
      idempotencyKey: key,
      fingerprint,
      draft,
      error,
    });
    throw error;
  }

  const finalized = await finalizeCheckout({
    pool,
    idempotencyKey: key,
    fingerprint,
    draft,
    session,
  });

  return {
    ...finalized,
    offer,
    price,
    stripeMode: stripeMode.mode,
  };
}

async function closePool() {
  if (defaultPool) {
    await defaultPool.end();
    defaultPool = null;
  }
}

module.exports = {
  IDEMPOTENCY_SCOPE,
  validateIdempotencyKey,
  checkoutFingerprint,
  checkoutBaseUrl,
  stripeModeFromKey,
  assertStripeMode,
  buildStripeSessionParams,
  loadOrCreateCheckoutDraft,
  finalizeCheckout,
  recordCheckoutFailure,
  startCheckout,
  closePool,
};

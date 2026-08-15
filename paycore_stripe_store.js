'use strict';

const { Pool } = require('pg');

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for PayCore Stripe processing');
  }
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

function minimalReceiptPayload(payment) {
  return {
    event_id: payment.stripeEventId,
    event_type: payment.eventType,
    checkout_session_id: payment.checkoutSessionId,
    payment_intent_id: payment.paymentIntentId,
    paycore_intent_id: payment.paycoreIntentId,
    amount_minor: payment.amountMinor,
    currency: payment.currency,
    payment_status: payment.paymentStatus,
    livemode: payment.livemode,
  };
}

async function findIntentForUpdate(client, payment) {
  const candidates = [
    payment.paycoreIntentId
      ? ['id', payment.paycoreIntentId]
      : null,
    payment.checkoutSessionId
      ? ['provider_object_id', payment.checkoutSessionId]
      : null,
    payment.paymentIntentId
      ? ['provider_payment_intent_id', payment.paymentIntentId]
      : null,
  ].filter(Boolean);

  for (const [column, value] of candidates) {
    const result = await client.query(
      `SELECT * FROM payment_intents WHERE ${column} = $1 FOR UPDATE`,
      [value],
    );
    if (result.rowCount > 1) {
      const error = new Error(`multiple PayCore intents matched ${column}`);
      error.code = 'PAYCORE_AMBIGUOUS_INTENT';
      throw error;
    }
    if (result.rowCount === 1) return result.rows[0];
  }

  return null;
}

function validateIntentMatch(intent, payment) {
  if (Number(intent.amount_minor) !== payment.amountMinor) {
    return { ok: false, reason: 'amount_mismatch' };
  }
  if (String(intent.currency || '').trim().toUpperCase() !== payment.currency) {
    return { ok: false, reason: 'currency_mismatch' };
  }
  if (intent.provider && intent.provider !== 'stripe') {
    return { ok: false, reason: 'provider_mismatch' };
  }
  if (intent.provider_object_id && intent.provider_object_id !== payment.checkoutSessionId) {
    return { ok: false, reason: 'checkout_session_mismatch' };
  }
  if (
    intent.provider_payment_intent_id &&
    payment.paymentIntentId &&
    intent.provider_payment_intent_id !== payment.paymentIntentId
  ) {
    return { ok: false, reason: 'payment_intent_mismatch' };
  }
  return { ok: true };
}

async function markReceiptFailed(client, payment, reason, intentId = null) {
  await client.query(
    `UPDATE webhook_receipts
     SET status = 'failed',
         intent_id = COALESCE($3, intent_id),
         last_error = $4,
         payload = $5::jsonb,
         updated_at = now()
     WHERE provider = $1 AND event_id = $2`,
    ['stripe', payment.stripeEventId, intentId, reason, JSON.stringify(minimalReceiptPayload(payment))],
  );
}

async function processVerifiedStripeSuccess(payment, { pool: injectedPool } = {}) {
  const activePool = injectedPool || getPool();
  const client = await activePool.connect();

  try {
    await client.query('BEGIN');

    const existingReceipt = await client.query(
      `SELECT status, intent_id
       FROM webhook_receipts
       WHERE provider = $1 AND event_id = $2
       FOR UPDATE`,
      ['stripe', payment.stripeEventId],
    );

    if (existingReceipt.rowCount && existingReceipt.rows[0].status === 'processed') {
      await client.query('COMMIT');
      return {
        status: 'duplicate',
        eventId: payment.stripeEventId,
        intentId: existingReceipt.rows[0].intent_id || null,
      };
    }

    if (existingReceipt.rowCount) {
      await client.query(
        `UPDATE webhook_receipts
         SET status = 'processing', last_error = NULL, updated_at = now()
         WHERE provider = $1 AND event_id = $2`,
        ['stripe', payment.stripeEventId],
      );
    } else {
      await client.query(
        `INSERT INTO webhook_receipts (provider, event_id, status, kind, payload)
         VALUES ($1, $2, 'processing', $3, $4::jsonb)`,
        ['stripe', payment.stripeEventId, payment.eventType, JSON.stringify(minimalReceiptPayload(payment))],
      );
    }

    const intent = await findIntentForUpdate(client, payment);
    if (!intent) {
      await markReceiptFailed(client, payment, 'payment_intent_not_found');
      await client.query('COMMIT');
      return { status: 'retry', reason: 'payment_intent_not_found', eventId: payment.stripeEventId };
    }

    const match = validateIntentMatch(intent, payment);
    if (!match.ok) {
      await markReceiptFailed(client, payment, match.reason, intent.id);
      await client.query('COMMIT');
      return { status: 'rejected', reason: match.reason, eventId: payment.stripeEventId, intentId: intent.id };
    }

    await client.query(
      `UPDATE payment_intents
       SET state = 'succeeded',
           provider = 'stripe',
           livemode = $5,
           provider_object_id = COALESCE(provider_object_id, $2),
           provider_payment_intent_id = COALESCE(provider_payment_intent_id, $3),
           succeeded_at = COALESCE(succeeded_at, $4::timestamptz),
           updated_at = now()
       WHERE id = $1`,
      [intent.id, payment.checkoutSessionId, payment.paymentIntentId, payment.paidAt, payment.livemode],
    );

    await client.query(
      `UPDATE payment_attempts
       SET state = 'succeeded', provider_status = 'paid', updated_at = now()
       WHERE intent_id = $1 AND provider = 'stripe' AND external_id = $2`,
      [intent.id, payment.checkoutSessionId],
    );

    await client.query(
      `UPDATE webhook_receipts
       SET status = 'processed',
           intent_id = $3,
           processed_at = COALESCE(processed_at, now()),
           last_error = NULL,
           payload = $4::jsonb,
           updated_at = now()
       WHERE provider = $1 AND event_id = $2`,
      ['stripe', payment.stripeEventId, intent.id, JSON.stringify(minimalReceiptPayload(payment))],
    );

    await client.query('COMMIT');
    return {
      status: 'recorded',
      eventId: payment.stripeEventId,
      intentId: intent.id,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  minimalReceiptPayload,
  findIntentForUpdate,
  validateIntentMatch,
  processVerifiedStripeSuccess,
  closePool,
};

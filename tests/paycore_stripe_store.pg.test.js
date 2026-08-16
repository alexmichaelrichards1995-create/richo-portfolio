'use strict';

const assert = require('assert');
const { Pool } = require('pg');
const { processVerifiedStripeSuccess } = require('../paycore_stripe_store');

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('PayCore Stripe store pg test skipped: DATABASE_URL not set');
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const intentId = `intent_store_${suffix}`;
  const orderReference = `order_store_${suffix}`;
  const attemptId = `attempt_store_${suffix}`;
  const sessionId = `cs_store_${suffix}`;
  const paymentIntentId = `pi_store_${suffix}`;
  const eventId = `evt_store_${suffix}`;
  const mismatchEventId = `evt_store_mismatch_${suffix}`;
  const unknownEventId = `evt_store_unknown_${suffix}`;

  try {
    await pool.query(
      `INSERT INTO payment_intents (
        id, order_reference, sku, product_name, amount_minor, net_minor, gst_minor,
        tax_mode, currency, billing_type, state, provider, provider_object_id,
        provider_payment_intent_id, fulfilment_state
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        intentId,
        orderReference,
        'RICH-TEST',
        'R.I.C.H.O. Test Offer',
        19900,
        18091,
        1809,
        'gst_inclusive',
        'AUD',
        'one_time',
        'checkout_created',
        'stripe',
        sessionId,
        paymentIntentId,
        'pending',
      ],
    );

    await pool.query(
      `INSERT INTO payment_attempts (id, intent_id, provider, state, external_id, provider_status)
       VALUES ($1,$2,'stripe','checkout_created',$3,'open')`,
      [attemptId, intentId, sessionId],
    );

    const payment = {
      stripeEventId: eventId,
      eventType: 'checkout.session.completed',
      checkoutSessionId: sessionId,
      paymentIntentId,
      paycoreIntentId: intentId,
      amountMinor: 19900,
      currency: 'AUD',
      paymentStatus: 'paid',
      livemode: false,
      paidAt: '2026-08-15T00:00:00.000Z',
    };

    const first = await processVerifiedStripeSuccess(payment, { pool });
    assert.strictEqual(first.status, 'recorded');
    assert.strictEqual(first.intentId, intentId);

    const intent = await pool.query(
      `SELECT state, provider_object_id, provider_payment_intent_id, livemode, fulfilment_state, succeeded_at
       FROM payment_intents WHERE id = $1`,
      [intentId],
    );
    assert.strictEqual(intent.rows[0].state, 'succeeded');
    assert.strictEqual(intent.rows[0].provider_object_id, sessionId);
    assert.strictEqual(intent.rows[0].provider_payment_intent_id, paymentIntentId);
    assert.strictEqual(intent.rows[0].livemode, false);
    assert.strictEqual(intent.rows[0].fulfilment_state, 'pending');
    assert.ok(intent.rows[0].succeeded_at);

    const receipt = await pool.query(
      `SELECT status, intent_id, last_error, payload
       FROM webhook_receipts WHERE provider='stripe' AND event_id=$1`,
      [eventId],
    );
    assert.strictEqual(receipt.rowCount, 1);
    assert.strictEqual(receipt.rows[0].status, 'processed');
    assert.strictEqual(receipt.rows[0].intent_id, intentId);
    assert.strictEqual(receipt.rows[0].last_error, null);
    assert.strictEqual(receipt.rows[0].payload.amount_minor, 19900);
    assert.ok(!JSON.stringify(receipt.rows[0].payload).includes('customer'));

    const attempt = await pool.query(
      `SELECT state, provider_status FROM payment_attempts WHERE id=$1`,
      [attemptId],
    );
    assert.strictEqual(attempt.rows[0].state, 'succeeded');
    assert.strictEqual(attempt.rows[0].provider_status, 'paid');

    const duplicate = await processVerifiedStripeSuccess(payment, { pool });
    assert.strictEqual(duplicate.status, 'duplicate');
    const receiptCount = await pool.query(
      `SELECT count(*)::int AS count FROM webhook_receipts WHERE provider='stripe' AND event_id=$1`,
      [eventId],
    );
    assert.strictEqual(receiptCount.rows[0].count, 1);

    const mismatch = await processVerifiedStripeSuccess({
      ...payment,
      stripeEventId: mismatchEventId,
      amountMinor: 4900,
    }, { pool });
    assert.strictEqual(mismatch.status, 'rejected');
    assert.strictEqual(mismatch.reason, 'amount_mismatch');
    const mismatchReceipt = await pool.query(
      `SELECT status, last_error FROM webhook_receipts WHERE provider='stripe' AND event_id=$1`,
      [mismatchEventId],
    );
    assert.deepStrictEqual(mismatchReceipt.rows[0], {
      status: 'failed',
      last_error: 'amount_mismatch',
    });

    const unknown = await processVerifiedStripeSuccess({
      ...payment,
      stripeEventId: unknownEventId,
      checkoutSessionId: `cs_unknown_${suffix}`,
      paymentIntentId: `pi_unknown_${suffix}`,
      paycoreIntentId: `intent_unknown_${suffix}`,
    }, { pool });
    assert.strictEqual(unknown.status, 'retry');
    assert.strictEqual(unknown.reason, 'payment_intent_not_found');
    const unknownReceipt = await pool.query(
      `SELECT status, intent_id, last_error FROM webhook_receipts WHERE provider='stripe' AND event_id=$1`,
      [unknownEventId],
    );
    assert.strictEqual(unknownReceipt.rows[0].status, 'failed');
    assert.strictEqual(unknownReceipt.rows[0].intent_id, null);
    assert.strictEqual(unknownReceipt.rows[0].last_error, 'payment_intent_not_found');

    console.log('PayCore Stripe PostgreSQL adapter test passed');
  } finally {
    await pool.query(
      `DELETE FROM webhook_receipts WHERE provider='stripe' AND event_id = ANY($1::text[])`,
      [[eventId, mismatchEventId, unknownEventId]],
    ).catch(() => {});
    await pool.query('DELETE FROM payment_attempts WHERE id=$1', [attemptId]).catch(() => {});
    await pool.query('DELETE FROM payment_intents WHERE id=$1', [intentId]).catch(() => {});
    await pool.end();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

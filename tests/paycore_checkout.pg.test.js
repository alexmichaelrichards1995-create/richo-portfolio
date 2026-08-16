'use strict';

const assert = require('assert');
const { Pool } = require('pg');
const { startCheckout, IDEMPOTENCY_SCOPE } = require('../paycore_checkout');

function fakeStripeFactory(calls, { failOnce = false } = {}) {
  let failed = false;
  return {
    checkout: {
      sessions: {
        create: async (params, options) => {
          calls.push({ params, options });
          if (failOnce && !failed) {
            failed = true;
            const error = new Error('simulated Stripe network failure');
            error.code = 'ETIMEDOUT';
            throw error;
          }
          const intentId = params.client_reference_id;
          return {
            id: `cs_test_${intentId.slice(-16)}`,
            url: `https://checkout.stripe.test/c/pay/${intentId.slice(-16)}`,
            status: 'open',
            livemode: false,
            expires_at: 1786850000,
          };
        },
      },
    },
  };
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('PayCore checkout pg test skipped: DATABASE_URL not set');
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const key = `checkout_test_${suffix}`;
  const failureKey = `checkout_failure_${suffix}`;
  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
    STRIPE_API_KEY: 'sk_test_richo_checkout_contract',
    CHECKOUT_BASE_URL: 'https://richosystems.technology',
    AU_GST_REGISTERED: 'true',
    ALLOW_LIVE_STRIPE: 'false',
  };
  const calls = [];
  const stripe = fakeStripeFactory(calls);
  const createdIntentIds = [];

  try {
    const first = await startCheckout({
      sku: 'ai-quick-fix',
      idempotencyKey: key,
      env,
      pool,
      stripeClient: stripe,
    });

    assert.strictEqual(first.status, 'checkout_created');
    assert.strictEqual(first.reused, false);
    assert.strictEqual(first.offer.sku, 'RICHO-AQF-COURSE');
    assert.strictEqual(first.price.amountMinor, 4900);
    assert.strictEqual(first.price.gstMinor, 445);
    assert.strictEqual(first.stripeMode, 'test');
    createdIntentIds.push(first.intentId);

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].params.mode, 'payment');
    assert.strictEqual(calls[0].params.client_reference_id, first.intentId);
    assert.strictEqual(calls[0].params.line_items[0].price_data.currency, 'aud');
    assert.strictEqual(calls[0].params.line_items[0].price_data.unit_amount, 4900);
    assert.strictEqual(calls[0].params.metadata.paycore_intent_id, first.intentId);
    assert.strictEqual(calls[0].params.metadata.sku, 'RICHO-AQF-COURSE');
    assert.strictEqual(calls[0].options.idempotencyKey, `paycore_checkout_${first.intentId}`);
    assert.match(calls[0].params.success_url, /session_id=\{CHECKOUT_SESSION_ID\}/);

    const intent = await pool.query(
      `SELECT order_reference, sku, product_name, amount_minor, net_minor, gst_minor,
              tax_mode, currency, state, provider, provider_object_id, succeeded_at
       FROM payment_intents WHERE id=$1`,
      [first.intentId],
    );
    assert.strictEqual(intent.rowCount, 1);
    assert.strictEqual(intent.rows[0].sku, 'RICHO-AQF-COURSE');
    assert.strictEqual(intent.rows[0].product_name, 'AI Quick Fix for Small Business');
    assert.strictEqual(Number(intent.rows[0].amount_minor), 4900);
    assert.strictEqual(Number(intent.rows[0].net_minor), 4455);
    assert.strictEqual(Number(intent.rows[0].gst_minor), 445);
    assert.strictEqual(intent.rows[0].tax_mode, 'gst_inclusive');
    assert.strictEqual(intent.rows[0].currency.trim(), 'AUD');
    assert.strictEqual(intent.rows[0].state, 'checkout_created');
    assert.strictEqual(intent.rows[0].provider, 'stripe');
    assert.strictEqual(intent.rows[0].provider_object_id, first.sessionId);
    assert.strictEqual(intent.rows[0].succeeded_at, null);

    const attempt = await pool.query(
      `SELECT state, external_id, checkout_url, provider_status
       FROM payment_attempts WHERE id=$1`,
      [first.attemptId],
    );
    assert.strictEqual(attempt.rowCount, 1);
    assert.strictEqual(attempt.rows[0].state, 'checkout_created');
    assert.strictEqual(attempt.rows[0].external_id, first.sessionId);
    assert.strictEqual(attempt.rows[0].checkout_url, first.checkoutUrl);
    assert.strictEqual(attempt.rows[0].provider_status, 'open');

    const idem = await pool.query(
      `SELECT request_fingerprint, response
       FROM idempotency_records WHERE scope=$1 AND key=$2`,
      [IDEMPOTENCY_SCOPE, key],
    );
    assert.strictEqual(idem.rowCount, 1);
    assert.strictEqual(String(idem.rows[0].request_fingerprint).trim().length, 64);
    assert.strictEqual(idem.rows[0].response.status, 'checkout_created');
    assert.strictEqual(idem.rows[0].response.intent_id, first.intentId);

    const replay = await startCheckout({
      sku: 'ai-quick-fix',
      idempotencyKey: key,
      env,
      pool,
      stripeClient: stripe,
    });
    assert.strictEqual(replay.reused, true);
    assert.strictEqual(replay.intentId, first.intentId);
    assert.strictEqual(replay.sessionId, first.sessionId);
    assert.strictEqual(calls.length, 1, 'replay must not create a second Stripe Checkout Session');

    await assert.rejects(
      () => startCheckout({
        sku: 'quick-wins-kit',
        idempotencyKey: key,
        env,
        pool,
        stripeClient: stripe,
      }),
      error => error && error.code === 'IDEMPOTENCY_CONFLICT',
    );
    assert.strictEqual(calls.length, 1);

    const failureCalls = [];
    const flakyStripe = fakeStripeFactory(failureCalls, { failOnce: true });
    let failedIntentId;
    await assert.rejects(
      async () => {
        try {
          await startCheckout({
            sku: 'quick-wins-kit',
            idempotencyKey: failureKey,
            env,
            pool,
            stripeClient: flakyStripe,
          });
        } catch (error) {
          const row = await pool.query(
            `SELECT response FROM idempotency_records WHERE scope=$1 AND key=$2`,
            [IDEMPOTENCY_SCOPE, failureKey],
          );
          failedIntentId = row.rows[0].response.intent_id;
          createdIntentIds.push(failedIntentId);
          assert.strictEqual(row.rows[0].response.status, 'retryable_error');
          throw error;
        }
      },
      error => error && error.code === 'ETIMEDOUT',
    );

    const failedState = await pool.query(
      `SELECT pi.state AS intent_state, pa.state AS attempt_state, pa.error_code
       FROM payment_intents pi
       JOIN payment_attempts pa ON pa.intent_id=pi.id
       WHERE pi.id=$1`,
      [failedIntentId],
    );
    assert.strictEqual(failedState.rows[0].intent_state, 'checkout_retryable');
    assert.strictEqual(failedState.rows[0].attempt_state, 'checkout_failed');
    assert.strictEqual(failedState.rows[0].error_code, 'ETIMEDOUT');

    const retry = await startCheckout({
      sku: 'quick-wins-kit',
      idempotencyKey: failureKey,
      env,
      pool,
      stripeClient: flakyStripe,
    });
    assert.strictEqual(retry.intentId, failedIntentId);
    assert.strictEqual(retry.status, 'checkout_created');
    assert.strictEqual(failureCalls.length, 2);
    assert.strictEqual(
      failureCalls[0].options.idempotencyKey,
      failureCalls[1].options.idempotencyKey,
      'Stripe retry must use the same idempotency key',
    );

    console.log('PayCore checkout PostgreSQL integration test passed');
  } finally {
    await pool.query(
      `DELETE FROM idempotency_records WHERE scope=$1 AND key = ANY($2::text[])`,
      [IDEMPOTENCY_SCOPE, [key, failureKey]],
    ).catch(() => {});
    if (createdIntentIds.length) {
      await pool.query('DELETE FROM payment_attempts WHERE intent_id = ANY($1::text[])', [createdIntentIds]).catch(() => {});
      await pool.query('DELETE FROM payment_intents WHERE id = ANY($1::text[])', [createdIntentIds]).catch(() => {});
    }
    await pool.end();
  }
}

run().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

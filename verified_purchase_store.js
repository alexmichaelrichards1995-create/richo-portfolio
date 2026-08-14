/* verified_purchase_store.js
 * PostgreSQL-backed verified purchase ledger and analytics outbox.
 * Production intentionally fails closed when DATABASE_URL is absent.
 */

const { Pool } = require('pg');

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for verified purchase processing');
  }
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

async function upsertVerifiedPurchase(purchase) {
  const sql = `
    INSERT INTO verified_purchases (
      stripe_event_id,
      checkout_session_id,
      payment_intent_id,
      subscription_id,
      customer_id,
      amount_minor,
      currency,
      product,
      posthog_distinct_id,
      attribution_quality,
      livemode,
      paid_at,
      analytics_event_uuid
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (checkout_session_id) DO UPDATE SET
      stripe_event_id = EXCLUDED.stripe_event_id,
      payment_intent_id = COALESCE(EXCLUDED.payment_intent_id, verified_purchases.payment_intent_id),
      subscription_id = COALESCE(EXCLUDED.subscription_id, verified_purchases.subscription_id),
      customer_id = COALESCE(EXCLUDED.customer_id, verified_purchases.customer_id),
      updated_at = now()
    RETURNING *`;

  const values = [
    purchase.stripeEventId,
    purchase.checkoutSessionId,
    purchase.paymentIntentId,
    purchase.subscriptionId,
    purchase.customerId,
    purchase.amountMinor,
    purchase.currency,
    purchase.product,
    purchase.posthogDistinctId,
    purchase.attributionQuality,
    purchase.livemode,
    purchase.paidAt,
    purchase.analyticsEventUuid,
  ];

  const result = await getPool().query(sql, values);
  return result.rows[0];
}

async function markAnalyticsAttempt(checkoutSessionId, sent) {
  const sql = `
    UPDATE verified_purchases
    SET analytics_attempts = analytics_attempts + 1,
        analytics_sent_at = CASE
          WHEN $2::boolean THEN COALESCE(analytics_sent_at, now())
          ELSE analytics_sent_at
        END,
        updated_at = now()
    WHERE checkout_session_id = $1
    RETURNING *`;
  const result = await getPool().query(sql, [checkoutSessionId, Boolean(sent)]);
  return result.rows[0] || null;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { upsertVerifiedPurchase, markAnalyticsAttempt, closePool };

/* db_client.js
 * Minimal DB client scaffold.
 * - Uses pg when DATABASE_URL is present
 * - Falls back to file-backed subscriptions for local/non-DB usage
 * - Webhook idempotency requires a real database
 */

const fs = require('fs');
const path = require('path');

let pgPool = null;
try {
  const { Pool } = require('pg');
  if (process.env.PGHOST || process.env.DATABASE_URL) {
    const sslEnabled = process.env.DATABASE_SSL === 'true';
    const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL || undefined,
      ssl: sslEnabled ? { rejectUnauthorized } : undefined,
    });
  }
} catch (e) {
  pgPool = null;
}

const FILE_STORE_DIR = path.join(__dirname, '..', 'data');
const SUBS_FILE = path.join(FILE_STORE_DIR, 'subscriptions.json');

async function ensureFileStore() {
  await fs.promises.mkdir(FILE_STORE_DIR, { recursive: true });
  try {
    await fs.promises.access(SUBS_FILE);
  } catch (e) {
    await fs.promises.writeFile(SUBS_FILE, JSON.stringify({}), 'utf8');
  }
}

async function upsertSubscriptionFile(accountId, record) {
  await ensureFileStore();
  const raw = await fs.promises.readFile(SUBS_FILE, 'utf8');
  const obj = JSON.parse(raw || '{}');
  obj[accountId] = record;
  await fs.promises.writeFile(SUBS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  return record;
}

async function getSubscriptionFile(accountId) {
  await ensureFileStore();
  const raw = await fs.promises.readFile(SUBS_FILE, 'utf8');
  const obj = JSON.parse(raw || '{}');
  return obj[accountId] || null;
}

function hasDatabase() {
  return Boolean(pgPool);
}

function requireDatabase() {
  if (!pgPool) {
    const error = new Error('DATABASE_URL is required for durable webhook processing');
    error.code = 'DATABASE_REQUIRED';
    throw error;
  }
  return pgPool;
}

async function withTransaction(fn) {
  const pool = requireDatabase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function upsertSubscription(accountId, record, options = {}) {
  const txClient = options.client || null;
  if (pgPool) {
    const sql = `INSERT INTO subscriptions (account_id, account_login, plan_id, plan_name, monthly_price_in_cents, tier, status, effective_at, billing_cycle_start, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      ON CONFLICT (account_id) DO UPDATE SET
        account_login = EXCLUDED.account_login,
        plan_id = EXCLUDED.plan_id,
        plan_name = EXCLUDED.plan_name,
        monthly_price_in_cents = EXCLUDED.monthly_price_in_cents,
        tier = EXCLUDED.tier,
        status = EXCLUDED.status,
        effective_at = EXCLUDED.effective_at,
        updated_at = now()
      RETURNING *`;
    const values = [
      accountId,
      record.account_login || null,
      record.plan_id || null,
      record.plan_name || null,
      record.monthly_price_in_cents || null,
      record.tier || 'free',
      record.status || 'free',
      record.effective_at || null,
      record.billing_cycle_start || null,
    ];
    if (txClient) {
      const res = await txClient.query(sql, values);
      return res.rows[0];
    }

    const client = await pgPool.connect();
    try {
      const res = await client.query(sql, values);
      return res.rows[0];
    } finally {
      client.release();
    }
  }

  return upsertSubscriptionFile(accountId, record);
}

async function getSubscription(accountId) {
  if (pgPool) {
    const sql = `SELECT * FROM subscriptions WHERE account_id = $1 LIMIT 1`;
    const client = await pgPool.connect();
    try {
      const res = await client.query(sql, [accountId]);
      return res.rows[0] || null;
    } finally {
      client.release();
    }
  }

  return getSubscriptionFile(accountId);
}

async function reserveWebhookDelivery(client, deliveryId, eventName, action, payload) {
  const res = await client.query(
    `INSERT INTO webhook_deliveries (delivery_id, event_name, action, status, payload, received_at, updated_at)
     VALUES ($1, $2, $3, 'processing', $4::jsonb, now(), now())
     ON CONFLICT (delivery_id) DO NOTHING
     RETURNING delivery_id`,
    [deliveryId, eventName, action || null, JSON.stringify(payload || {})]
  );
  return res.rowCount === 1;
}

async function markWebhookDeliveryProcessed(client, deliveryId) {
  await client.query(
    `UPDATE webhook_deliveries
     SET status='processed', processed_at=now(), updated_at=now(), error=NULL
     WHERE delivery_id=$1`,
    [deliveryId]
  );
}

async function markWebhookDeliveryFailed(client, deliveryId, errorMessage) {
  await client.query(
    `UPDATE webhook_deliveries
     SET status='failed', error=$2, updated_at=now()
     WHERE delivery_id=$1`,
    [deliveryId, String(errorMessage || 'unknown error').slice(0, 2000)]
  );
}

async function clearWebhookDeliveriesForTests() {
  const pool = requireDatabase();
  await pool.query('TRUNCATE webhook_deliveries');
}

module.exports = {
  hasDatabase,
  requireDatabase,
  withTransaction,
  upsertSubscription,
  getSubscription,
  reserveWebhookDelivery,
  markWebhookDeliveryProcessed,
  markWebhookDeliveryFailed,
  clearWebhookDeliveriesForTests,
};

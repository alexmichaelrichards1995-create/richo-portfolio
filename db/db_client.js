/* db_client.js
 * Minimal DB client scaffold. Uses pg if PG_* env vars present; otherwise falls back to file-backed store for local dev/tests.
 * Replace with real connection pooling and migrations in production.
 */

const fs = require('fs');
const path = require('path');

let pgPool = null;
try {
  const { Pool } = require('pg');
  if (process.env.PGHOST || process.env.DATABASE_URL) {
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL || undefined });
  }
} catch (e) {
  // pg not installed — fallback to file store
}

const FILE_STORE_DIR = path.join(__dirname, '..', 'data');
const SUBS_FILE = path.join(FILE_STORE_DIR, 'subscriptions.json');

async function ensureFileStore() {
  await fs.promises.mkdir(FILE_STORE_DIR, { recursive: true });
  try { await fs.promises.access(SUBS_FILE); } catch (e) { await fs.promises.writeFile(SUBS_FILE, JSON.stringify({}), 'utf8'); }
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

async function upsertSubscription(accountId, record) {
  if (pgPool) {
    const sql = `INSERT INTO subscriptions (account_id, account_login, plan_id, plan_name, monthly_price_in_cents, status, billing_cycle_start, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now())
      ON CONFLICT (account_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        plan_name = EXCLUDED.plan_name,
        monthly_price_in_cents = EXCLUDED.monthly_price_in_cents,
        status = EXCLUDED.status,
        updated_at = now()
      RETURNING *`;
    const values = [accountId, record.account_login || null, record.plan_id, record.plan_name || null, record.monthly_price_in_cents || null, record.status || 'active', record.billing_cycle_start || null];
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(sql, values);
      await client.query('COMMIT');
      return res.rows[0];
    } catch (e) {
      await client.query('ROLLBACK').catch(()=>{});
      throw e;
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

module.exports = { upsertSubscription, getSubscription };

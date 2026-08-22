/* db_client.js
 * Legacy GitHub Marketplace persistence adapter.
 *
 * This adapter intentionally targets legacy_marketplace_subscriptions and a
 * dedicated LEGACY_MARKETPLACE_DATABASE_URL so it cannot accidentally attach
 * to the Supabase customer-commerce database or the canonical github-app DB.
 */

const fs = require('fs');
const path = require('path');

let pgPool = null;
try {
  const { Pool } = require('pg');
  const connectionString = process.env.LEGACY_MARKETPLACE_DATABASE_URL;
  if (connectionString) {
    pgPool = new Pool({ connectionString });
  }
} catch {
  pgPool = null;
}

const FILE_STORE_DIR = path.join(__dirname, '..', 'data');
const SUBS_FILE = path.join(FILE_STORE_DIR, 'legacy_marketplace_subscriptions.json');

function fileStoreAllowed() {
  return process.env.ALLOW_FILE_STORE === 'true' || process.env.NODE_ENV === 'test';
}

function requireFileStoreAllowed() {
  if (!fileStoreAllowed()) {
    throw new Error(
      'LEGACY_MARKETPLACE_DATABASE_URL is not configured and file-store fallback is disabled',
    );
  }
}

async function ensureFileStore() {
  requireFileStoreAllowed();
  await fs.promises.mkdir(FILE_STORE_DIR, { recursive: true });
  try {
    await fs.promises.access(SUBS_FILE);
  } catch {
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

async function upsertSubscription(accountId, record) {
  if (pgPool) {
    const sql = `INSERT INTO legacy_marketplace_subscriptions
      (account_id, account_login, plan_id, plan_name, monthly_price_in_cents, status, billing_cycle_start, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now())
      ON CONFLICT (account_id) DO UPDATE SET
        account_login = EXCLUDED.account_login,
        plan_id = EXCLUDED.plan_id,
        plan_name = EXCLUDED.plan_name,
        monthly_price_in_cents = EXCLUDED.monthly_price_in_cents,
        status = EXCLUDED.status,
        billing_cycle_start = EXCLUDED.billing_cycle_start,
        updated_at = now()
      RETURNING *`;
    const values = [
      accountId,
      record.account_login || null,
      record.plan_id,
      record.plan_name || null,
      record.monthly_price_in_cents || null,
      record.status || 'active',
      record.billing_cycle_start || null,
    ];
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
    const client = await pgPool.connect();
    try {
      const res = await client.query(
        'SELECT * FROM legacy_marketplace_subscriptions WHERE account_id = $1 LIMIT 1',
        [accountId],
      );
      return res.rows[0] || null;
    } finally {
      client.release();
    }
  }

  return getSubscriptionFile(accountId);
}

module.exports = { upsertSubscription, getSubscription, fileStoreAllowed };

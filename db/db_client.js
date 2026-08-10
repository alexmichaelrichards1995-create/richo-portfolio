/* db_client.js
 * Minimal DB client scaffold. Uses pg if PG_* env vars present; otherwise falls back to file-backed store for local dev/tests.
 * Replace with real connection pooling and migrations in production.
 */

const fs = require('fs');
const path = require('path');

let pgClient = null;
try {
  const { Client } = require('pg');
  if (process.env.PGHOST) {
    pgClient = new Client({
      connectionString: process.env.DATABASE_URL || undefined,
    });
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
  if (pgClient) {
    // TODO: implement real upsert with pgClient.connect() and parameterized SQL
    throw new Error('Postgres upsert not implemented in scaffold');
  }
  return upsertSubscriptionFile(accountId, record);
}

async function getSubscription(accountId) {
  if (pgClient) {
    throw new Error('Postgres get not implemented in scaffold');
  }
  return getSubscriptionFile(accountId);
}

module.exports = { upsertSubscription, getSubscription };

/* subscriptions_service.js
 * Minimal scaffold for subscription persistence.
 * - Uses file-backed store (data/subscriptions.json) if no DB configured
 * - Exports upsertSubscription(accountId, plan) and getSubscription(accountId)
 * Replace with real PostgreSQL upsert logic when ready.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');

async function ensureStore() {
  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
  } catch (e) {}
  try {
    await fs.promises.access(SUBS_FILE);
  } catch (e) {
    await fs.promises.writeFile(SUBS_FILE, JSON.stringify({}), 'utf8');
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.promises.readFile(SUBS_FILE, 'utf8');
  return JSON.parse(raw || '{}');
}

async function writeStore(obj) {
  await ensureStore();
  await fs.promises.writeFile(SUBS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

// Upsert subscription for an account — idempotent by checking existing plan
const dbClient = require('./db/db_client');

async function upsertSubscription(accountId, plan) {
  if (!accountId) throw new Error('accountId required');

  const record = {
    accountId,
    account_login: plan.account_login || null,
    plan_id: plan.id,
    plan_name: plan.name,
    monthly_price_in_cents: plan.monthly_price_in_cents || null,
    status: 'active',
    billing_cycle_start: null,
    updated_at: new Date().toISOString()
  };

  try {
    const res = await dbClient.upsertSubscription(accountId, record);
    // When using file store, dbClient returns the record; for Postgres it returns row
    return { upserted: true, record: res };
  } catch (e) {
    // fallback to file store logic if db client fails
    const store = await readStore();
    const existing = store[accountId];
    if (existing && existing.planId === plan.id) return { upserted: false, existing };
    store[accountId] = record;
    await writeStore(store);
    return { upserted: true, record };
  }
}

async function getSubscription(accountId) {
  try {
    return await dbClient.getSubscription(accountId);
  } catch (e) {
    const store = await readStore();
    return store[accountId] || null;
  }
}

module.exports = { upsertSubscription, getSubscription };

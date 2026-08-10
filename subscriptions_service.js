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
async function upsertSubscription(accountId, plan) {
  if (!accountId) throw new Error('accountId required');
  const store = await readStore();
  const existing = store[accountId];
  if (existing && existing.planId === plan.id) {
    // already applied
    return { upserted: false, existing };
  }

  const record = {
    accountId,
    planId: plan.id,
    planName: plan.name,
    monthly_price_in_cents: plan.monthly_price_in_cents || null,
    updated_at: new Date().toISOString()
  };
  store[accountId] = record;
  await writeStore(store);
  return { upserted: true, record };
}

async function getSubscription(accountId) {
  const store = await readStore();
  return store[accountId] || null;
}

module.exports = { upsertSubscription, getSubscription };

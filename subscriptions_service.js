/* subscriptions_service.js
 * Legacy Marketplace subscription service.
 *
 * Production persistence errors fail closed. File-backed storage is permitted
 * only for explicit test/development use through db_client.fileStoreAllowed().
 */

const fs = require('fs');
const path = require('path');
const dbClient = require('./db/db_client');

const DATA_DIR = path.join(__dirname, 'data');
const SUBS_FILE = path.join(DATA_DIR, 'legacy_marketplace_subscriptions.json');

function requireFallbackAllowed() {
  if (!dbClient.fileStoreAllowed()) {
    throw new Error('Legacy Marketplace file-store fallback is disabled');
  }
}

async function ensureStore() {
  requireFallbackAllowed();
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.promises.access(SUBS_FILE);
  } catch {
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

async function upsertSubscription(accountId, plan) {
  if (!accountId) throw new Error('accountId required');

  const record = {
    accountId,
    account_login: plan.account_login || null,
    plan_id: plan.id,
    plan_name: plan.name,
    monthly_price_in_cents: plan.monthly_price_in_cents || null,
    status: plan.status || 'active',
    billing_cycle_start: plan.billing_cycle_start || null,
    updated_at: new Date().toISOString(),
  };

  try {
    const res = await dbClient.upsertSubscription(accountId, record);
    return { upserted: true, record: res };
  } catch (error) {
    if (!dbClient.fileStoreAllowed()) throw error;

    const store = await readStore();
    const existing = store[accountId];
    if (existing && existing.plan_id === plan.id && existing.status === record.status) {
      return { upserted: false, existing };
    }
    store[accountId] = record;
    await writeStore(store);
    return { upserted: true, record };
  }
}

async function getSubscription(accountId) {
  try {
    return await dbClient.getSubscription(accountId);
  } catch (error) {
    if (!dbClient.fileStoreAllowed()) throw error;
    const store = await readStore();
    return store[accountId] || null;
  }
}

module.exports = { upsertSubscription, getSubscription };
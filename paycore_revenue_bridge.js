'use strict';

const crypto = require('crypto');
const { Pool } = require('pg');
const { capturePostHogEvent } = require('./posthog_server');

const CHECKPOINT_PREFIX = 'analytics:posthog:purchase:';

function deterministicUuid(input) {
  const bytes = crypto.createHash('sha256').update(String(input)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeSucceededIntent(row) {
  if (!row || !row.id || !row.succeeded_at) return null;
  if (row.livemode !== true) return null;

  const amountMinor = Number(row.amount_minor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;

  const currency = String(row.currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;

  return {
    id: String(row.id),
    sku: row.sku ? String(row.sku).slice(0, 100) : null,
    product: row.product_name ? String(row.product_name).slice(0, 160) : null,
    amountMinor,
    currency,
    provider: row.provider ? String(row.provider).slice(0, 40) : 'stripe',
    succeededAt: new Date(row.succeeded_at).toISOString(),
  };
}

function buildPurchaseEvent(intent) {
  const uuid = deterministicUuid(`richo_purchase_completed:${intent.id}`);
  return {
    event: 'richo_purchase_completed',
    distinctId: `paycore:${intent.id}`,
    timestamp: intent.succeededAt,
    uuid,
    properties: {
      revenue: intent.amountMinor,
      currency: intent.currency,
      product: intent.product,
      sku: intent.sku,
      payment_provider: intent.provider,
      source: 'paycore',
      payment_truth: 'authoritative_verified',
      $process_person_profile: false,
    },
  };
}

class PgPayCoreRevenueStore {
  constructor(pool) {
    this.pool = pool;
  }

  async listSucceeded(limit = 100) {
    const bounded = Math.max(1, Math.min(Number(limit) || 100, 100));
    const result = await this.pool.query(
      `SELECT id, sku, product_name, amount_minor, currency, provider, livemode, succeeded_at
       FROM payment_intents
       WHERE succeeded_at IS NOT NULL
         AND livemode IS TRUE
         AND amount_minor > 0
       ORDER BY succeeded_at ASC, id ASC
       LIMIT $1`,
      [bounded],
    );
    return result.rows;
  }

  async getCheckpoint(intentId) {
    const key = `${CHECKPOINT_PREFIX}${intentId}`;
    const result = await this.pool.query('SELECT value FROM paycore_kv WHERE key = $1 LIMIT 1', [key]);
    return result.rows[0] ? result.rows[0].value : null;
  }

  async markSent(intentId, event) {
    const key = `${CHECKPOINT_PREFIX}${intentId}`;
    const value = {
      event: event.event,
      event_uuid: event.uuid,
      sent_at: new Date().toISOString(),
      source: 'paycore',
      revenue_minor: event.properties.revenue,
      currency: event.properties.currency,
    };
    await this.pool.query(
      `INSERT INTO paycore_kv (key, value, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
    return value;
  }
}

async function syncPayCoreRevenue(options = {}) {
  const store = options.store;
  const capture = options.capture || capturePostHogEvent;
  const limit = Math.max(1, Math.min(Number(options.limit) || 100, 100));
  if (!store) throw new Error('PayCore revenue store is required');

  const rows = await store.listSucceeded(limit);
  const result = { scanned: rows.length, sent: 0, skipped: 0, invalid: 0, failed: 0 };

  for (const row of rows) {
    const intent = normalizeSucceededIntent(row);
    if (!intent) {
      result.invalid += 1;
      continue;
    }

    const checkpoint = await store.getCheckpoint(intent.id);
    if (checkpoint && checkpoint.sent_at) {
      result.skipped += 1;
      continue;
    }

    const event = buildPurchaseEvent(intent);
    try {
      await capture(event);
      await store.markSent(intent.id, event);
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      if (options.onError) options.onError(error, intent);
    }
  }

  return result;
}

async function syncPayCoreRevenueFromEnvironment(options = {}) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!process.env.POSTHOG_PROJECT_TOKEN) throw new Error('POSTHOG_PROJECT_TOKEN is required');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
  });

  try {
    return await syncPayCoreRevenue({
      store: new PgPayCoreRevenueStore(pool),
      capture: options.capture || capturePostHogEvent,
      limit: options.limit,
      onError: options.onError,
    });
  } finally {
    await pool.end().catch(() => {});
  }
}

module.exports = {
  CHECKPOINT_PREFIX,
  deterministicUuid,
  normalizeSucceededIntent,
  buildPurchaseEvent,
  PgPayCoreRevenueStore,
  syncPayCoreRevenue,
  syncPayCoreRevenueFromEnvironment,
};

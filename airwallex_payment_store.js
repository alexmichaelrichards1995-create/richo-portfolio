const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function parseEventTime(event) {
  const object = event?.data?.object || {};
  const raw = event?.created_at || object.updated_at || object.created_at;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed) : new Date();
}

function normalizeRecord(event) {
  const object = event?.data?.object || {};
  if (!event?.id) throw new Error('missing Airwallex event id');
  if (!event?.name) throw new Error('missing Airwallex event name');
  if (!object?.id) throw new Error('missing payment intent id');

  return {
    eventId: String(event.id),
    eventName: String(event.name),
    paymentIntentId: String(object.id),
    merchantOrderId: object.merchant_order_id ? String(object.merchant_order_id) : null,
    amount: Number.isFinite(Number(object.amount)) ? Number(object.amount) : null,
    currency: object.currency ? String(object.currency).toUpperCase() : null,
    paymentStatus: object.status ? String(object.status).toUpperCase() : String(event.name).replace('payment_intent.', '').toUpperCase(),
    eventTime: parseEventTime(event),
    payloadSha256: crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex'),
  };
}

class PaymentStore {
  constructor(options = {}) {
    this.filePath = options.filePath || path.join(__dirname, 'data', 'airwallex_payments.json');
    this.pool = options.pool || null;

    if (!options.forceFile && !this.pool && (process.env.PGHOST || process.env.DATABASE_URL)) {
      try {
        const { Pool } = require('pg');
        this.pool = new Pool({ connectionString: process.env.DATABASE_URL || undefined });
      } catch (_) {
        this.pool = null;
      }
    }
  }

  async ensureFileStore() {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.promises.access(this.filePath);
    } catch (_) {
      await fs.promises.writeFile(this.filePath, JSON.stringify({ events: {}, payments: {} }, null, 2), 'utf8');
    }
  }

  async readFileStore() {
    await this.ensureFileStore();
    const raw = await fs.promises.readFile(this.filePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return { events: parsed.events || {}, payments: parsed.payments || {} };
  }

  async writeFileStore(data) {
    await this.ensureFileStore();
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tempPath, this.filePath);
  }

  async applyPaymentEvent(event) {
    const record = normalizeRecord(event);
    if (this.pool) return this.applyPostgres(record);
    return this.applyFile(record);
  }

  async applyPostgres(record) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO airwallex_webhook_events
          (event_id, event_name, payment_intent_id, event_timestamp, payload_sha256)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [record.eventId, record.eventName, record.paymentIntentId, record.eventTime, record.payloadSha256]
      );

      if (!inserted.rowCount) {
        await client.query('ROLLBACK');
        return { duplicate: true, updated: false, record };
      }

      const result = await client.query(
        `INSERT INTO airwallex_payment_ledger
          (payment_intent_id, merchant_order_id, amount, currency, payment_status, last_event_name, last_event_at, last_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (payment_intent_id) DO UPDATE SET
           merchant_order_id = COALESCE(EXCLUDED.merchant_order_id, airwallex_payment_ledger.merchant_order_id),
           amount = COALESCE(EXCLUDED.amount, airwallex_payment_ledger.amount),
           currency = COALESCE(EXCLUDED.currency, airwallex_payment_ledger.currency),
           payment_status = EXCLUDED.payment_status,
           last_event_name = EXCLUDED.last_event_name,
           last_event_at = EXCLUDED.last_event_at,
           last_event_id = EXCLUDED.last_event_id,
           updated_at = now()
         WHERE EXCLUDED.last_event_at >= airwallex_payment_ledger.last_event_at
         RETURNING *`,
        [
          record.paymentIntentId,
          record.merchantOrderId,
          record.amount,
          record.currency,
          record.paymentStatus,
          record.eventName,
          record.eventTime,
          record.eventId,
        ]
      );

      await client.query('COMMIT');
      return { duplicate: false, updated: result.rowCount > 0, record: result.rows[0] || record };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async applyFile(record) {
    const store = await this.readFileStore();
    if (store.events[record.eventId]) return { duplicate: true, updated: false, record };

    store.events[record.eventId] = {
      eventName: record.eventName,
      paymentIntentId: record.paymentIntentId,
      eventTime: record.eventTime.toISOString(),
      payloadSha256: record.payloadSha256,
    };

    const current = store.payments[record.paymentIntentId];
    const currentTime = current ? Date.parse(current.lastEventAt) : -Infinity;
    if (!current || record.eventTime.getTime() >= currentTime) {
      store.payments[record.paymentIntentId] = {
        paymentIntentId: record.paymentIntentId,
        merchantOrderId: record.merchantOrderId || current?.merchantOrderId || null,
        amount: record.amount ?? current?.amount ?? null,
        currency: record.currency || current?.currency || null,
        paymentStatus: record.paymentStatus,
        lastEventName: record.eventName,
        lastEventAt: record.eventTime.toISOString(),
        lastEventId: record.eventId,
      };
    }

    await this.writeFileStore(store);
    return { duplicate: false, updated: !current || record.eventTime.getTime() >= currentTime, record: store.payments[record.paymentIntentId] };
  }

  async getPayment(paymentIntentId) {
    if (this.pool) {
      const result = await this.pool.query(
        'SELECT * FROM airwallex_payment_ledger WHERE payment_intent_id = $1 LIMIT 1',
        [paymentIntentId]
      );
      return result.rows[0] || null;
    }
    const store = await this.readFileStore();
    return store.payments[paymentIntentId] || null;
  }
}

module.exports = { PaymentStore, normalizeRecord, parseEventTime };

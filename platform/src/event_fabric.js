'use strict';

const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = stableJson(value[key]);
      return out;
    }, {});
  }
  return value;
}

function createEvent(input) {
  if (!input || !input.type || !input.source) throw new Error('event type and source are required');
  const occurredAt = input.occurredAt || new Date().toISOString();
  const correlationId = input.correlationId || crypto.randomUUID();
  const causationId = input.causationId || null;
  const subject = input.subject || null;
  const payload = stableJson(input.payload || {});
  const idempotencyKey = input.idempotencyKey || sha256({ source: input.source, type: input.type, occurredAt, subject, payload });

  return Object.freeze({
    id: input.id || crypto.randomUUID(),
    schemaVersion: input.schemaVersion || 1,
    type: input.type,
    source: input.source,
    subject,
    correlationId,
    causationId,
    idempotencyKey,
    occurredAt,
    receivedAt: new Date().toISOString(),
    risk: input.risk || 'low',
    dataClass: input.dataClass || 'internal',
    payload,
    payloadHash: sha256(payload)
  });
}

class EventFabric {
  constructor({ store, handlers = {}, deadLetterStore, telemetry = console }) {
    if (!store) throw new Error('event store required');
    this.store = store;
    this.handlers = new Map(Object.entries(handlers));
    this.deadLetterStore = deadLetterStore || store;
    this.telemetry = telemetry;
  }

  register(type, handler) {
    if (!type || typeof handler !== 'function') throw new Error('type and handler required');
    this.handlers.set(type, handler);
  }

  async ingest(raw) {
    const event = createEvent(raw);
    const existing = await this.store.findByIdempotencyKey?.(event.idempotencyKey);
    if (existing) return { status: 'duplicate', event: existing };

    await this.store.append(event);
    await this.dispatch(event);
    return { status: 'accepted', event };
  }

  async dispatch(event) {
    const handler = this.handlers.get(event.type) || this.handlers.get('*');
    if (!handler) {
      await this.store.markProcessed?.(event.id, { status: 'unhandled' });
      return { status: 'unhandled' };
    }

    const started = Date.now();
    try {
      const result = await handler(event);
      await this.store.markProcessed?.(event.id, {
        status: 'processed',
        durationMs: Date.now() - started,
        resultHash: sha256(stableJson(result || {}))
      });
      return { status: 'processed', result };
    } catch (error) {
      const failure = {
        eventId: event.id,
        correlationId: event.correlationId,
        type: event.type,
        error: String(error && error.message || error),
        failedAt: new Date().toISOString(),
        retryable: error?.retryable !== false
      };
      await this.deadLetterStore.appendDeadLetter?.(failure);
      await this.store.markProcessed?.(event.id, { status: 'failed', error: failure.error });
      this.telemetry.error?.('RICHO_EVENT_FAILURE', failure);
      throw error;
    }
  }

  async replay(eventId) {
    const event = await this.store.get?.(eventId);
    if (!event) throw new Error(`event not found: ${eventId}`);
    return this.dispatch(event);
  }

  async reconcile({ source, fetchAuthoritative, readProjection, emitCorrection }) {
    const authoritative = await fetchAuthoritative();
    const projection = await readProjection();
    const correction = await emitCorrection({ source, authoritative, projection });
    return {
      source,
      authoritativeHash: sha256(stableJson(authoritative)),
      projectionHash: sha256(stableJson(projection)),
      changed: Boolean(correction),
      correction
    };
  }
}

module.exports = { EventFabric, createEvent, stableJson, sha256 };

'use strict';

const crypto = require('crypto');
const { createEvent, sha256, stableJson } = require('./event_fabric');

class EventFabricL2 {
  constructor({ store, schemaRegistry, telemetry = console, clock = () => new Date(), maxRetries = 5, replayWindowHours = 168, rateLimitPerMinute = 1000 } = {}) {
    if (!store) throw new Error('EventFabricL2 requires store');
    this.store = store;
    this.schemaRegistry = schemaRegistry || new MemorySchemaRegistry();
    this.telemetry = telemetry;
    this.clock = clock;
    this.maxRetries = maxRetries;
    this.replayWindowHours = replayWindowHours;
    this.rateLimitPerMinute = rateLimitPerMinute;
  }

  async registerSchema({ type, version, schema, compatibility = 'backward' }) {
    return this.schemaRegistry.register({ type, version, schema, compatibility });
  }

  async publish(raw) {
    const event = createEvent(raw);
    const validation = this.schemaRegistry.validate(event.type, event.schemaVersion, event.payload);
    if (!validation.valid) throw new Error(`schema_validation_failed:${validation.errors.join(',')}`);
    if (!this.#withinRate(event.source)) throw new Error(`event_rate_limited:${event.source}`);
    const partitionKey = raw.partitionKey || event.subject || event.correlationId;
    const sequence = await this.store.nextPartitionSequence({ partitionKey });
    const enriched = Object.freeze({ ...event, partitionKey, sequence, lineageHash: sha256({ correlationId: event.correlationId, causationId: event.causationId, payloadHash: event.payloadHash }) });
    const duplicate = await this.store.findByIdempotencyKey?.(event.idempotencyKey);
    if (duplicate) return { status: 'duplicate', event: duplicate };
    await this.store.append(enriched);
    await this.store.recordEventMetric?.({ metric: 'published', type: event.type, source: event.source, at: this.clock() });
    return { status: 'accepted', event: enriched };
  }

  async consume({ consumerId, type, handler, batchSize = 100 }) {
    if (!consumerId || typeof handler !== 'function') throw new Error('consumerId and handler required');
    const offset = await this.store.getConsumerOffset({ consumerId, type }) || 0;
    const events = await this.store.readAfterOffset({ type, offset, limit: batchSize });
    const results = [];
    for (const event of events) {
      const result = await this.#deliver({ consumerId, event, handler });
      results.push(result);
      if (result.status === 'processed' || result.status === 'quarantined') {
        await this.store.commitConsumerOffset({ consumerId, type, offset: event.globalOffset });
      } else break;
    }
    return results;
  }

  async #deliver({ consumerId, event, handler }) {
    const started = Date.now();
    let attempt = 0;
    while (attempt < this.maxRetries) {
      attempt += 1;
      try {
        const result = await handler(event);
        await this.store.recordDelivery({ id: crypto.randomUUID(), consumerId, eventId: event.id, attempt, status: 'processed', durationMs: Date.now() - started, resultHash: sha256(stableJson(result || {})), at: this.clock() });
        await this.store.recordEventMetric?.({ metric: 'processed', type: event.type, consumerId, at: this.clock() });
        return { status: 'processed', eventId: event.id, attempt, result };
      } catch (error) {
        const retryable = error?.retryable !== false;
        await this.store.recordDelivery({ id: crypto.randomUUID(), consumerId, eventId: event.id, attempt, status: retryable ? 'retrying' : 'failed', error: String(error.message || error), at: this.clock() });
        if (!retryable) break;
      }
    }
    const quarantine = { id: crypto.randomUUID(), eventId: event.id, consumerId, type: event.type, payloadHash: event.payloadHash, reason: 'delivery_exhausted', quarantinedAt: this.clock().toISOString() };
    await this.store.quarantineEvent(quarantine);
    await this.store.recordEventMetric?.({ metric: 'quarantined', type: event.type, consumerId, at: this.clock() });
    return { status: 'quarantined', eventId: event.id, attempts: attempt, quarantine };
  }

  async replay({ eventId, consumerId, handler, approvedBy }) {
    const event = await this.store.get(eventId);
    if (!event) throw new Error('event_not_found');
    const ageHours = (this.clock() - new Date(event.occurredAt)) / 3600000;
    if (ageHours > this.replayWindowHours) throw new Error('replay_window_expired');
    const receipt = await this.#deliver({ consumerId, event, handler });
    await this.store.recordReplay({ id: crypto.randomUUID(), eventId, consumerId, approvedBy, status: receipt.status, at: this.clock() });
    return receipt;
  }

  lineage(event) {
    return { eventId: event.id, correlationId: event.correlationId, causationId: event.causationId, partitionKey: event.partitionKey, sequence: event.sequence, lineageHash: event.lineageHash };
  }

  async health() {
    const metrics = await this.store.eventFlowSnapshot?.() || {};
    return { ...metrics, replayWindowHours: this.replayWindowHours, maxRetries: this.maxRetries, rateLimitPerMinute: this.rateLimitPerMinute };
  }

  #withinRate(source) {
    if (!this._rate) this._rate = new Map();
    const minute = Math.floor(this.clock().getTime() / 60000);
    const key = `${source}:${minute}`;
    const count = (this._rate.get(key) || 0) + 1;
    this._rate.set(key, count);
    return count <= this.rateLimitPerMinute;
  }
}

class MemorySchemaRegistry {
  constructor(){ this.schemas = new Map(); }
  register({ type, version, schema, compatibility = 'backward' }) {
    const key = `${type}:${version}`;
    if (this.schemas.has(key)) throw new Error('schema_version_exists');
    this.schemas.set(key, { type, version, schema, compatibility });
    return this.schemas.get(key);
  }
  validate(type, version, payload) {
    const entry = this.schemas.get(`${type}:${version}`);
    if (!entry) return { valid: true, errors: [] };
    const required = entry.schema.required || [];
    const errors = required.filter(k => !(k in payload)).map(k => `missing:${k}`);
    return { valid: errors.length === 0, errors };
  }
}

module.exports = { EventFabricL2, MemorySchemaRegistry };

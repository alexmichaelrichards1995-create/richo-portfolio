const crypto = require('crypto');

class ShopifyAppstleGateway {
  constructor({ eventFabric, commerceEngine, reconciliationStore, policyEngine, clock = () => new Date() } = {}) {
    if (!eventFabric || !commerceEngine || !reconciliationStore) throw new Error('ShopifyAppstleGateway missing required dependency');
    Object.assign(this, { eventFabric, commerceEngine, reconciliationStore, policyEngine, clock });
  }

  verifyShopifyWebhook({ rawBody, hmacHeader, secret }) {
    if (!secret || !hmacHeader) return false;
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    const a = Buffer.from(digest);
    const b = Buffer.from(hmacHeader);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async ingestShopify({ topic, shopDomain, webhookId, payload, rawBody, hmacHeader, secret, occurredAt }) {
    if (!this.verifyShopifyWebhook({ rawBody, hmacHeader, secret })) throw new Error('Invalid Shopify webhook signature');
    const normalized = normalizeShopifyEvent({ topic, shopDomain, webhookId, payload, occurredAt: occurredAt || this.clock().toISOString() });
    const duplicate = await this.reconciliationStore.hasExternalEvent?.('shopify', webhookId);
    if (duplicate) return { status: 'duplicate', event: normalized };
    await this.reconciliationStore.recordExternalEvent?.({ source: 'shopify', externalId: webhookId, type: normalized.type, payload: normalized });
    await this.eventFabric.publish({ type: normalized.type, source: 'shopify', payload: normalized, idempotencyKey: `shopify:${webhookId}` });
    await routeCommerceEvent(this.commerceEngine, normalized);
    return { status: 'accepted', event: normalized };
  }

  async ingestAppstle({ eventId, eventType, payload, occurredAt }) {
    const normalized = normalizeAppstleEvent({ eventId, eventType, payload, occurredAt: occurredAt || this.clock().toISOString() });
    const duplicate = await this.reconciliationStore.hasExternalEvent?.('appstle', eventId);
    if (duplicate) return { status: 'duplicate', event: normalized };
    await this.reconciliationStore.recordExternalEvent?.({ source: 'appstle', externalId: eventId, type: normalized.type, payload: normalized });
    await this.eventFabric.publish({ type: normalized.type, source: 'appstle', payload: normalized, idempotencyKey: `appstle:${eventId}` });
    await routeCommerceEvent(this.commerceEngine, normalized);
    return { status: 'accepted', event: normalized };
  }
}

function normalizeShopifyEvent({ topic, shopDomain, webhookId, payload = {}, occurredAt }) {
  const map = {
    'orders/paid': 'commerce.order.paid',
    'orders/create': 'commerce.order.created',
    'orders/cancelled': 'commerce.order.cancelled',
    'products/create': 'commerce.product.created',
    'products/update': 'commerce.product.updated',
    'customers/create': 'commerce.customer.created',
    'customers/update': 'commerce.customer.updated'
  };
  return { source: 'shopify', type: map[topic] || `shopify.${String(topic).replaceAll('/', '.')}`, externalEventId: webhookId, shopDomain, occurredAt, payload };
}

function normalizeAppstleEvent({ eventId, eventType, payload = {}, occurredAt }) {
  const normalizedType = String(eventType || '').toLowerCase();
  const type = normalizedType.includes('cancel') ? 'membership.cancelled' : normalizedType.includes('renew') ? 'membership.renewed' : normalizedType.includes('active') || normalizedType.includes('create') ? 'membership.activated' : `appstle.${normalizedType || 'event'}`;
  return { source: 'appstle', type, externalEventId: eventId, occurredAt, payload };
}

async function routeCommerceEvent(engine, event) {
  if (typeof engine.handleEvent === 'function') return engine.handleEvent(event);
  if (event.type === 'commerce.order.paid' && typeof engine.handlePaidOrder === 'function') return engine.handlePaidOrder(event);
  if (event.type.startsWith('membership.') && typeof engine.handleMembershipEvent === 'function') return engine.handleMembershipEvent(event);
  return null;
}

module.exports = { ShopifyAppstleGateway, normalizeShopifyEvent, normalizeAppstleEvent };

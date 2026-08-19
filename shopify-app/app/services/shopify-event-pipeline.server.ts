import { getDb } from './db.server';
import { createPostgresWebhookStore } from './postgres-webhook-store.server';
import { grantEntitlementsAtomic, revokeOrderEntitlementsAtomic } from './atomic-entitlements.server';

function deliveryId(request: Request) {
  return request.headers.get('x-shopify-webhook-id') || request.headers.get('x-shopify-event-id') || '';
}

export async function processPaidOrderEvent(input: {
  request: Request;
  shop: string;
  order: any;
  entitlements: Array<{ key: string; sourceSku: string; kind: string; tier?: string | null }>;
}) {
  const db = getDb();
  const webhookId = deliveryId(input.request);
  if (!webhookId) throw new Error('Missing Shopify webhook delivery id');
  const receipts = createPostgresWebhookStore(db);
  const lock = await receipts.begin(input.shop, 'ORDERS_PAID', webhookId);
  if (!lock.acquired) return { duplicate: true as const };

  try {
    const orderGid = String(input.order?.admin_graphql_api_id || input.order?.id || '');
    const customerGid = String(input.order?.customer?.admin_graphql_api_id || input.order?.customer?.id || '');
    if (!orderGid || !customerGid) throw new Error('Paid order is missing order/customer identity');

    const result = await grantEntitlementsAtomic(db, {
      shopDomain: input.shop,
      customerGid,
      orderGid,
      eventKey: `orders_paid:${webhookId}`,
      entitlements: input.entitlements,
    });
    await receipts.complete(input.shop, webhookId);
    return { duplicate: false as const, result };
  } catch (error) {
    await receipts.fail(input.shop, webhookId, error);
    throw error;
  }
}

export async function processRefundEvent(input: { request: Request; shop: string; refund: any }) {
  const db = getDb();
  const webhookId = deliveryId(input.request);
  if (!webhookId) throw new Error('Missing Shopify webhook delivery id');
  const receipts = createPostgresWebhookStore(db);
  const lock = await receipts.begin(input.shop, 'REFUNDS_CREATE', webhookId);
  if (!lock.acquired) return { duplicate: true as const };

  try {
    const orderGid = String(input.refund?.order?.admin_graphql_api_id || input.refund?.order_id || '');
    if (!orderGid) throw new Error('Refund is missing order identity');
    const found = await db.query<{ customer_gid: string }>(
      `SELECT customer_gid FROM customer_entitlements
       WHERE shop_domain=$1 AND order_gid=$2
       ORDER BY granted_at DESC LIMIT 1`,
      [input.shop, orderGid],
    );
    const customerGid = found.rows[0]?.customer_gid;
    if (!customerGid) throw new Error('No entitlement owner found for refunded order');

    const result = await revokeOrderEntitlementsAtomic(db, {
      shopDomain: input.shop,
      customerGid,
      orderGid,
      eventKey: `refunds_create:${webhookId}`,
      reason: `shopify_refund:${input.refund?.id || webhookId}`,
    });
    await receipts.complete(input.shop, webhookId);
    return { duplicate: false as const, result };
  } catch (error) {
    await receipts.fail(input.shop, webhookId, error);
    throw error;
  }
}

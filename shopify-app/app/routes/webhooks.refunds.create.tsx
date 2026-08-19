import type { ActionFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { revokeOrderEntitlements } from '../services/entitlement-store.server';

export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, payload } = await authenticate.webhook(request);
  if (topic !== 'REFUNDS_CREATE') return new Response('ignored', { status: 200 });

  const orderId = String(payload.order_id || '');
  if (!orderId) return new Response('missing order id', { status: 400 });

  await revokeOrderEntitlements({
    shop,
    orderId,
    reason: `shopify_refund:${payload.id || 'unknown'}`,
  });

  return new Response('ok', { status: 200 });
}

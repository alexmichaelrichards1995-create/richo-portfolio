import type { ActionFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { processRefundEvent } from '../services/shopify-event-pipeline.server';

export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, payload } = await authenticate.webhook(request);
  if (topic !== 'REFUNDS_CREATE') return new Response('ignored', { status: 200 });

  const outcome = await processRefundEvent({ request, shop, refund: payload as any });
  return Response.json({ accepted: true, duplicate: outcome.duplicate });
}

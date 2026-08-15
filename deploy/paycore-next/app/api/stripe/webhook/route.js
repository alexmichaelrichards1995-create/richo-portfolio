import { parseAndProcessWebhook } from '../../../../lib/paycore';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const rawBody = Buffer.from(await request.arrayBuffer());
    const result = await parseAndProcessWebhook(
      rawBody,
      request.headers.get('stripe-signature'),
    );
    return Response.json({ received: true, ...result }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    const type = String(error?.type || '');
    const invalidSignature = type.includes('StripeSignature') || message.includes('signature');

    return Response.json(
      invalidSignature
        ? { error: 'invalid_webhook' }
        : { received: true, status: 'retry' },
      {
        status: invalidSignature ? 400 : 500,
        headers: { 'cache-control': 'no-store' },
      },
    );
  }
}

export async function GET() {
  return Response.json({ error: 'method_not_allowed' }, {
    status: 405,
    headers: { Allow: 'POST', 'cache-control': 'no-store' },
  });
}

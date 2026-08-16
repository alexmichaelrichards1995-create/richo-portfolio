import { startCheckout } from '../../../../lib/paycore';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const { slug } = await params;
    const result = await startCheckout(slug, request.headers.get('idempotency-key'));
    return Response.json({
      status: result.status,
      reused: result.reused,
      intentId: result.intent_id,
      orderReference: result.order_reference,
      checkoutUrl: result.checkout_url,
      sku: result.sku,
      amountMinor: result.amount_minor,
      currency: result.currency,
      paymentMode: result.payment_mode,
    }, {
      status: result.reused ? 200 : 201,
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const status = error.code === 'UNKNOWN_SKU' ? 404
      : error.code === 'INVALID_IDEMPOTENCY_KEY' ? 400
      : error.code === 'IDEMPOTENCY_CONFLICT' ? 409
      : 503;

    return Response.json({
      error: status === 404 ? 'unknown_sku'
        : status === 400 ? 'invalid_idempotency_key'
        : status === 409 ? 'idempotency_conflict'
        : 'checkout_unavailable',
    }, {
      status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

export async function GET() {
  return Response.json({ error: 'method_not_allowed' }, {
    status: 405,
    headers: { Allow: 'POST', 'cache-control': 'no-store' },
  });
}

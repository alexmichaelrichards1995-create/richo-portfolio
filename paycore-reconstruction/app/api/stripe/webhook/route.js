import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseStripeSignature(header) {
  const values = new Map();
  for (const part of String(header || '').split(',')) {
    const [key, value] = part.split('=', 2);
    if (key && value) values.set(key.trim(), value.trim());
  }
  return { timestamp: values.get('t'), signature: values.get('v1') };
}

function safeEqualHex(left, right) {
  try {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: 'webhook_not_configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const { timestamp, signature } = parseStripeSignature(request.headers.get('stripe-signature'));
  if (!timestamp || !signature) {
    return Response.json({ error: 'invalid_signature_header' }, { status: 400 });
  }

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) {
    return Response.json({ error: 'signature_timestamp_out_of_range' }, { status: 400 });
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  if (!safeEqualHex(expected, signature)) {
    return Response.json({ error: 'signature_verification_failed' }, { status: 400 });
  }

  // Reconstruction is preview-only: validate transport/signing but perform no billing,
  // CRM, fulfilment, database mutation, or other external side effect.
  return Response.json({
    received: true,
    verified: true,
    processed: false,
    reason: 'preview_no_side_effects',
    paymentMode: 'sandbox',
    liveMoney: false
  }, { status: 200, headers: { 'cache-control': 'no-store' } });
}

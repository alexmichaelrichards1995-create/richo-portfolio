import { loadConfig, publicOffers } from '../../../lib/config';

export const runtime = 'nodejs';

export async function GET() {
  let mode = 'unknown';
  try {
    mode = loadConfig().mode;
  } catch (_) {}

  return Response.json({
    currency: 'AUD',
    paymentMode: mode,
    offers: publicOffers(),
  }, { headers: { 'cache-control': 'no-store' } });
}

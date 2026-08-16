import { checkDatabase } from '../../../lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await checkDatabase();
  const ready = db.reachable && Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  return Response.json({
    status: ready ? 'ready' : 'not-ready',
    deployment: process.env.VERCEL_ENV || 'preview',
    paymentMode: 'sandbox',
    liveMoney: false,
    database: db.reachable ? 'reachable' : 'unreachable',
    schema: 'paycore-v3',
    checkout: 'configured',
    webhook: process.env.STRIPE_WEBHOOK_SECRET ? 'configured' : 'missing',
    sandboxRevenueExcluded: true
  }, { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}

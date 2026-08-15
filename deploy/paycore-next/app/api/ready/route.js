import { readiness } from '../../../lib/paycore';

export const runtime = 'nodejs';

export async function GET() {
  const result = await readiness();
  return Response.json({
    status: result.ok ? 'ready' : 'not_ready',
    deployment: 'production',
    paymentMode: result.mode || 'unknown',
    liveMoney: result.mode === 'live',
    database: result.database || 'unknown',
    schema: result.schema || 'unknown',
    checkout: result.ok ? 'configured' : 'not_ready',
    webhook: result.ok ? 'configured' : 'not_ready',
    sandboxRevenueExcluded: result.mode === 'sandbox',
    stage: result.stage,
  }, {
    status: result.ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}

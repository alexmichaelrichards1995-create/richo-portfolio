import { loadConfig } from '../../../lib/config';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const config = loadConfig();
    return Response.json({
      service: 'richo-paycore',
      version: '3.0.0',
      deployment: 'production',
      paymentMode: config.mode,
      status: 'configured',
      codeReady: true,
      databaseConfigured: true,
      webhookConfigured: true,
      paymentLinksConfigured: true,
      gstRegistered: config.gstRegistered,
      liveMoney: config.mode === 'live',
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (_) {
    return Response.json({
      service: 'richo-paycore',
      version: '3.0.0',
      deployment: 'production',
      status: 'activation_required',
      codeReady: true,
    }, { headers: { 'cache-control': 'no-store' } });
  }
}

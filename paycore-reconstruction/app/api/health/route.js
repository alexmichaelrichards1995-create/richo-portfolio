export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    service: 'richo-paycore',
    version: '3.0.0',
    deployment: process.env.VERCEL_ENV || 'preview',
    paymentMode: 'sandbox',
    status: 'configured',
    codeReady: true,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    paymentLinksConfigured: process.env.PAYMENT_LINKS_CONFIGURED === 'true',
    gstRegistered: false,
    liveMoney: false
  }, { headers: { 'cache-control': 'no-store' } });
}

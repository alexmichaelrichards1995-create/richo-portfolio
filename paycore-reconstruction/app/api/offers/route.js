export const dynamic = 'force-dynamic';

const offers = [
  { slug: 'quick-wins-kit', sku: 'RSP-056', name: 'R.I.C.H.O. AI Business Quick-Wins Kit', amountMinor: 1900, currency: 'AUD' },
  { slug: 'ai-quick-fix', sku: 'RICHO-AQF-COURSE', name: 'AI Quick Fix for Small Business', amountMinor: 4900, currency: 'AUD' },
  { slug: 'ai-quick-fix-session', sku: 'RICHO-AQF-SESSION', name: 'AI Quick Fix Session', amountMinor: 19700, currency: 'AUD' }
];

export async function GET() {
  return Response.json({ currency: 'AUD', paymentMode: 'sandbox', offers }, { headers: { 'cache-control': 'no-store' } });
}

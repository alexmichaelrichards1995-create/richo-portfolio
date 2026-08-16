const offerSlugs = new Set(['quick-wins-kit', 'ai-quick-fix', 'ai-quick-fix-session']);

export async function POST(_request, { params }) {
  const { slug } = await params;
  if (!offerSlugs.has(slug)) {
    return Response.json({ error: 'offer_not_found' }, { status: 404 });
  }

  return Response.json({
    status: 'blocked',
    reason: 'preview_sandbox_only',
    paymentMode: 'sandbox',
    liveMoney: false,
    slug
  }, { status: 409, headers: { 'cache-control': 'no-store' } });
}

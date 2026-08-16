'use client';

import { captureRichoEvent } from './AnalyticsClient';

const offers = [
  { slug: 'quick-wins-kit', sku: 'RSP-056', name: 'R.I.C.H.O. AI Business Quick-Wins Kit', price: 'A$19' },
  { slug: 'ai-quick-fix', sku: 'RICHO-AQF-COURSE', name: 'AI Quick Fix for Small Business', price: 'A$49' },
  { slug: 'ai-quick-fix-session', sku: 'RICHO-AQF-SESSION', name: 'AI Quick Fix Session', price: 'A$197' },
];

function safeStripeUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (!['buy.stripe.com', 'book.stripe.com'].includes(url.hostname)) return null;
    return url.toString();
  } catch (_) {
    return null;
  }
}

export default function CheckoutClient() {
  async function start(offer, button) {
    button.disabled = true;
    const status = document.getElementById('checkout-status');

    captureRichoEvent('richo_cta_clicked', {
      cta: 'open_secure_checkout',
      offer_slug: offer.slug,
      sku: offer.sku,
    });

    try {
      const requestKey = `richo-${offer.slug}-${crypto.randomUUID()}`;
      const response = await fetch(`/api/checkout/${encodeURIComponent(offer.slug)}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Idempotency-Key': requestKey,
        },
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

      const checkoutUrl = safeStripeUrl(payload.checkoutUrl);
      if (!checkoutUrl) throw new Error('unsafe_checkout_url');

      await captureRichoEvent('richo_checkout_started', {
        offer_slug: offer.slug,
        sku: payload.sku || offer.sku,
        amount_minor: payload.amountMinor,
        currency: payload.currency,
        payment_mode: payload.paymentMode,
      });

      status.textContent = 'PayCore intent created. Opening secure Stripe checkout…';
      location.assign(checkoutUrl);
    } catch (error) {
      captureRichoEvent('richo_checkout_failed', {
        offer_slug: offer.slug,
        sku: offer.sku,
        reason: String(error?.message || 'checkout_unavailable').slice(0, 120),
      });
      status.textContent = `Checkout unavailable: ${error.message}`;
      button.disabled = false;
    }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18, marginTop: 32 }}>
        {offers.map(offer => (
          <article key={offer.slug} style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 20, padding: 24 }}>
            <h2 style={{ fontSize: 18, minHeight: 50 }}>{offer.name}</h2>
            <div style={{ fontSize: 32, fontWeight: 850, margin: '18px 0' }}>{offer.price}</div>
            <button
              type="button"
              onClick={event => start(offer, event.currentTarget)}
              style={{ width: '100%', border: 0, borderRadius: 12, padding: '13px 16px', background: '#101828', color: '#fff', fontWeight: 750, cursor: 'pointer' }}
            >
              Open secure checkout
            </button>
          </article>
        ))}
      </div>
      <div id="checkout-status" aria-live="polite" style={{ marginTop: 22, padding: '14px 16px', borderRadius: 12, background: '#eef2ff', color: '#3730a3' }}>
        Ready to create checkout.
      </div>
    </div>
  );
}

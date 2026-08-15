import CheckoutClient from './CheckoutClient';

export default function Page() {
  const paymentMode = process.env.PAYMENT_MODE === 'live' ? 'live' : 'sandbox';
  const live = paymentMode === 'live';

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 20px 72px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center', marginBottom: 42 }}>
        <strong style={{ letterSpacing: '.04em' }}>R.I.C.H.O. SYSTEMS · PAYCORE</strong>
        <span style={{
          padding: '8px 12px',
          border: `1px solid ${live ? '#12b76a' : '#f59e0b'}`,
          borderRadius: 999,
          background: live ? '#ecfdf3' : '#fffbeb',
          color: live ? '#027a48' : '#92400e',
          fontSize: 14,
        }}>
          {live ? 'Stripe live payments' : 'Stripe sandbox validation · no live funds'}
        </span>
      </header>

      <h1 style={{ fontSize: 'clamp(2.2rem,6vw,4.8rem)', lineHeight: .98, margin: '0 0 18px', maxWidth: 850 }}>
        Secure checkout with PayCore payment truth.
      </h1>
      <p style={{ maxWidth: 760, fontSize: 17, lineHeight: 1.65, color: '#475467' }}>
        PayCore creates the authoritative payment intent before Stripe checkout and verifies signed Stripe events before recording payment success.
      </p>

      <CheckoutClient />

      <p style={{ fontSize: 14, color: '#667085', lineHeight: 1.5, marginTop: 24 }}>
        {live
          ? 'Live revenue is recognized only from signed live-mode Stripe events that match an existing PayCore intent.'
          : 'Sandbox payments are excluded from real revenue telemetry. Live-mode Stripe events are rejected in sandbox mode.'}
      </p>
    </main>
  );
}

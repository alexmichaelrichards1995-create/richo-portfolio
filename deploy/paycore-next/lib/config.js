const ALLOWED_MODES = new Set(['sandbox', 'live']);

export const OFFERS = Object.freeze({
  'quick-wins-kit': Object.freeze({
    slug: 'quick-wins-kit',
    sku: 'RSP-056',
    name: 'R.I.C.H.O. AI Business Quick-Wins Kit',
    amountMinor: 1900,
    currency: 'AUD',
    fulfilment: 'digital_download',
    linkUrlEnv: 'PAYMENT_LINK_RSP056_URL',
    linkIdEnv: 'PAYMENT_LINK_RSP056_ID',
  }),
  'ai-quick-fix': Object.freeze({
    slug: 'ai-quick-fix',
    sku: 'RICHO-AQF-COURSE',
    name: 'AI Quick Fix for Small Business',
    amountMinor: 4900,
    currency: 'AUD',
    fulfilment: 'digital_download',
    linkUrlEnv: 'PAYMENT_LINK_COURSE_URL',
    linkIdEnv: 'PAYMENT_LINK_COURSE_ID',
  }),
  'ai-quick-fix-session': Object.freeze({
    slug: 'ai-quick-fix-session',
    sku: 'RICHO-AQF-SESSION',
    name: 'AI Quick Fix Session',
    amountMinor: 19700,
    currency: 'AUD',
    fulfilment: 'service_booking',
    linkUrlEnv: 'PAYMENT_LINK_SESSION_URL',
    linkIdEnv: 'PAYMENT_LINK_SESSION_ID',
  }),
});

export const OFFERS_BY_SKU = new Map(Object.values(OFFERS).map(offer => [offer.sku, offer]));

function required(env, key) {
  const value = String(env[key] || '').trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function paymentMode(env) {
  const mode = required(env, 'PAYMENT_MODE').toLowerCase();
  if (!ALLOWED_MODES.has(mode)) throw new Error('PAYMENT_MODE must be sandbox or live');
  return mode;
}

function validateStripeLink(raw, mode) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !['buy.stripe.com', 'book.stripe.com'].includes(url.hostname)) {
    throw new Error('Stripe Payment Link URL is not trusted');
  }

  const pathIsTest = url.pathname.startsWith('/test_');
  if (mode === 'sandbox' && !pathIsTest) throw new Error('Sandbox mode requires test Payment Links');
  if (mode === 'live' && pathIsTest) throw new Error('Live mode cannot use test Payment Links');
  return url.toString();
}

export function loadConfig(env = process.env) {
  const mode = paymentMode(env);
  const gstRegistered = required(env, 'AU_GST_REGISTERED');
  if (!['true', 'false'].includes(gstRegistered)) {
    throw new Error('AU_GST_REGISTERED must be explicitly true or false');
  }

  const links = {};
  for (const offer of Object.values(OFFERS)) {
    links[offer.slug] = {
      url: validateStripeLink(required(env, offer.linkUrlEnv), mode),
      id: required(env, offer.linkIdEnv),
    };
  }

  return Object.freeze({
    databaseUrl: required(env, 'DATABASE_URL'),
    webhookSecret: required(env, 'STRIPE_WEBHOOK_SECRET'),
    mode,
    gstRegistered: gstRegistered === 'true',
    browserPosthogProjectToken: required(env, 'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN'),
    browserPosthogHost: String(env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, ''),
    posthogProjectToken: String(env.POSTHOG_PROJECT_TOKEN || '').trim() || null,
    posthogHost: String(env.POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, ''),
    links: Object.freeze(links),
  });
}

export function publicOffers() {
  return Object.values(OFFERS).map(offer => ({
    slug: offer.slug,
    sku: offer.sku,
    name: offer.name,
    amountMinor: offer.amountMinor,
    currency: offer.currency,
  }));
}

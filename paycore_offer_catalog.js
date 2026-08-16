'use strict';

const OFFERS = Object.freeze([
  Object.freeze({
    slug: 'quick-wins-kit',
    sku: 'RSP-056',
    name: 'R.I.C.H.O. AI Business Quick-Wins Kit',
    description: 'Digital educational business-improvement resource.',
    amountMinor: 1900,
    currency: 'AUD',
    billingType: 'one_time',
    fulfilmentType: 'digital_download',
  }),
  Object.freeze({
    slug: 'ai-quick-fix',
    sku: 'RICHO-AQF-COURSE',
    name: 'AI Quick Fix for Small Business',
    description: 'Self-paced practical AI training for small-business admin workflows.',
    amountMinor: 4900,
    currency: 'AUD',
    billingType: 'one_time',
    fulfilmentType: 'digital_download',
  }),
  Object.freeze({
    slug: 'ai-quick-fix-session',
    sku: 'RICHO-AQF-SESSION',
    name: 'AI Quick Fix Session',
    description: 'One-hour guided setup for a practical, human-reviewed AI workflow.',
    amountMinor: 19700,
    currency: 'AUD',
    billingType: 'one_time',
    fulfilmentType: 'service_booking',
  }),
]);

const LOOKUP = new Map();
for (const offer of OFFERS) {
  LOOKUP.set(offer.slug.toLowerCase(), offer);
  LOOKUP.set(offer.sku.toLowerCase(), offer);
}

function getOffer(identifier) {
  const key = String(identifier || '').trim().toLowerCase();
  return key ? LOOKUP.get(key) || null : null;
}

function parseGstRegistration(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  const error = new Error('AU_GST_REGISTERED must be explicitly true or false');
  error.code = 'GST_CONFIGURATION_REQUIRED';
  throw error;
}

function priceBreakdown(offer, env = process.env) {
  if (!offer) throw new Error('Offer is required');
  const gstRegistered = parseGstRegistration(env.AU_GST_REGISTERED);

  if (!gstRegistered) {
    return {
      amountMinor: offer.amountMinor,
      netMinor: offer.amountMinor,
      gstMinor: 0,
      taxMode: 'not_registered',
      gstRegistered: false,
    };
  }

  // For a wholly taxable GST-inclusive Australian supply, GST is 1/11 of the
  // GST-inclusive price. Round to the nearest cent for the minor-unit ledger.
  const gstMinor = Math.round(offer.amountMinor / 11);
  return {
    amountMinor: offer.amountMinor,
    netMinor: offer.amountMinor - gstMinor,
    gstMinor,
    taxMode: 'gst_inclusive',
    gstRegistered: true,
  };
}

function publicOffer(offer) {
  return {
    slug: offer.slug,
    sku: offer.sku,
    name: offer.name,
    description: offer.description,
    amountMinor: offer.amountMinor,
    currency: offer.currency,
    billingType: offer.billingType,
  };
}

module.exports = {
  OFFERS,
  getOffer,
  parseGstRegistration,
  priceBreakdown,
  publicOffer,
};

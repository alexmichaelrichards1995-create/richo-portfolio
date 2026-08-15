'use strict';

const assert = require('assert');
const {
  OFFERS,
  getOffer,
  priceBreakdown,
} = require('../paycore_offer_catalog');

(() => {
  assert.strictEqual(OFFERS.length, 3);
  assert.deepStrictEqual(
    OFFERS.map(offer => [offer.sku, offer.amountMinor, offer.currency]),
    [
      ['RSP-056', 1900, 'AUD'],
      ['RICHO-AQF-COURSE', 4900, 'AUD'],
      ['RICHO-AQF-SESSION', 19700, 'AUD'],
    ],
  );

  assert.strictEqual(getOffer('quick-wins-kit').name, 'R.I.C.H.O. AI Business Quick-Wins Kit');
  assert.strictEqual(getOffer('RSP-056').amountMinor, 1900);
  assert.strictEqual(getOffer('ai-quick-fix').name, 'AI Quick Fix for Small Business');
  assert.strictEqual(getOffer('ai-quick-fix-session').name, 'AI Quick Fix Session');
  assert.strictEqual(getOffer('not-a-real-offer'), null);

  const gst19 = priceBreakdown(getOffer('quick-wins-kit'), { AU_GST_REGISTERED: 'true' });
  assert.deepStrictEqual(gst19, {
    amountMinor: 1900,
    netMinor: 1727,
    gstMinor: 173,
    taxMode: 'gst_inclusive',
    gstRegistered: true,
  });

  const gst49 = priceBreakdown(getOffer('ai-quick-fix'), { AU_GST_REGISTERED: 'true' });
  assert.strictEqual(gst49.gstMinor, 445);
  assert.strictEqual(gst49.netMinor, 4455);

  const gst197 = priceBreakdown(getOffer('ai-quick-fix-session'), { AU_GST_REGISTERED: 'true' });
  assert.strictEqual(gst197.gstMinor, 1791);
  assert.strictEqual(gst197.netMinor, 17909);

  const notRegistered = priceBreakdown(getOffer('ai-quick-fix'), { AU_GST_REGISTERED: 'false' });
  assert.deepStrictEqual(notRegistered, {
    amountMinor: 4900,
    netMinor: 4900,
    gstMinor: 0,
    taxMode: 'not_registered',
    gstRegistered: false,
  });

  assert.throws(
    () => priceBreakdown(getOffer('quick-wins-kit'), {}),
    error => error && error.code === 'GST_CONFIGURATION_REQUIRED',
  );

  console.log('PayCore offer catalog tests passed');
})();

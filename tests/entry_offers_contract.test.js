'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'entry-offers.html'), 'utf8');

for (const required of [
  'R.I.C.H.O. AI Business Quick-Wins Kit',
  'AI Quick Fix for Small Business',
  'AI Quick Fix Session',
  'A$19',
  'A$49',
  'A$197',
  'Request A$19 purchase access',
  'Request A$49 purchase access',
  'Request A$197 session access',
  'https://richosystems.technology/pilot?offer=quick-wins-kit',
  'https://richosystems.technology/pilot?offer=ai-quick-fix',
  'https://richosystems.technology/pilot?offer=ai-quick-fix-session',
  'Secure checkout activating',
  'no card details',
  'Machine final approvals: zero',
]) {
  assert.ok(html.includes(required), `entry-offers storefront missing required contract text: ${required}`);
}

assert.ok(!/https:\/\/(?:buy|book)\.stripe\.com\//.test(html), 'buyer storefront must not expose Stripe checkout while live payment mode is not confirmed');
assert.ok(!/guaranteed|guarantee revenue|limited time|only \d+ left|best[- ]selling|customer(s)? love|testimonial/i.test(html), 'storefront contains an unsupported commercial claim pattern');
assert.ok(!/<form\b/i.test(html), 'storefront must not collect personal data directly');
assert.ok(!/document\.cookie|localStorage|sessionStorage|posthog|gtag\(|google-analytics|segment\./i.test(html), 'storefront must not add tracking or local persistence');
assert.ok(html.includes('<meta name="robots" content="index,follow,max-image-preview:large">'), 'SEO robots metadata missing');
assert.ok(html.includes('<link rel="canonical" href="https://richosystems.technology/entry-offers">'), 'canonical URL contract missing');

console.log('Entry-offer storefront contract passed');

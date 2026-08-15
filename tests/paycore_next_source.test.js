'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'deploy', 'paycore-next');

function collectFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full));
    else files.push(full);
  }
  return files;
}

const files = collectFiles(root);
const sources = files
  .filter(file => /\.(?:js|json|md)$/.test(file))
  .map(file => ({ file, text: fs.readFileSync(file, 'utf8') }));
const combined = sources.map(source => source.text).join('\n');

assert.ok(files.length >= 8, 'expected canonical PayCore Next deployment files');

for (const { file, text } of sources) {
  assert.ok(!/postgres(?:ql)?:\/\/[^\s<>'"`]+:[^\s<>'"`]+@/i.test(text), `database credential found in ${file}`);
  assert.ok(!/whsec_[A-Za-z0-9]{16,}/.test(text), `Stripe webhook secret found in ${file}`);
  assert.ok(!/sk_(?:live|test)_[A-Za-z0-9]{16,}/.test(text), `Stripe secret key found in ${file}`);
  assert.ok(!/rk_(?:live|test)_[A-Za-z0-9]{16,}/.test(text), `Stripe restricted key found in ${file}`);
  assert.ok(!/npg_[A-Za-z0-9]{12,}/.test(text), `Neon password found in ${file}`);
}

for (const token of [
  'DATABASE_URL',
  'STRIPE_WEBHOOK_SECRET',
  'PAYMENT_MODE',
  'AU_GST_REGISTERED',
  'PAYMENT_LINK_RSP056_URL',
  'PAYMENT_LINK_RSP056_ID',
  'PAYMENT_LINK_COURSE_URL',
  'PAYMENT_LINK_COURSE_ID',
  'PAYMENT_LINK_SESSION_URL',
  'PAYMENT_LINK_SESSION_ID',
  'POSTHOG_PROJECT_TOKEN',
  'client_reference_id',
  'idempotency_records',
  'webhook_receipts',
  'event.livemode',
  'intent.livemode',
  'payment_link',
  'richo_purchase_completed',
  'sandbox_excluded_from_revenue',
]) {
  assert.ok(combined.includes(token), `PayCore Next source missing required control: ${token}`);
}

assert.ok(combined.includes("mode === 'sandbox'"), 'sandbox mode guard missing');
assert.ok(combined.includes("mode === 'live'"), 'live mode guard missing');
assert.ok(combined.includes("pathIsTest"), 'Payment Link test/live URL guard missing');
assert.ok(combined.includes('Boolean(event?.livemode) !== expectedLivemode'), 'Stripe event/payment mode equality gate missing');
assert.ok(!combined.includes('/api/selftest'), 'temporary self-test endpoint must not exist in source-controlled production package');
assert.ok(!combined.includes('SELFTEST='), 'temporary self-test token must not exist');

const configSource = fs.readFileSync(path.join(root, 'lib', 'config.js'), 'utf8');
for (const amount of ['1900', '4900', '19700']) {
  assert.ok(configSource.includes(`amountMinor: ${amount}`), `approved amount ${amount} missing from server offer catalog`);
}

console.log('PayCore Next secret-free production source contract passed');

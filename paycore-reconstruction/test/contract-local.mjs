import fs from 'node:fs';

const files = [
  'app/api/health/route.js',
  'app/api/ready/route.js',
  'app/api/offers/route.js',
  'app/api/checkout/[slug]/route.js',
  'app/api/stripe/webhook/route.js',
  'lib/db.js'
].map(p => `paycore-reconstruction/${p}`);

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
}

const health = fs.readFileSync('paycore-reconstruction/app/api/health/route.js', 'utf8');
const offers = fs.readFileSync('paycore-reconstruction/app/api/offers/route.js', 'utf8');
const checkout = fs.readFileSync('paycore-reconstruction/app/api/checkout/[slug]/route.js', 'utf8');
const webhook = fs.readFileSync('paycore-reconstruction/app/api/stripe/webhook/route.js', 'utf8');
const db = fs.readFileSync('paycore-reconstruction/lib/db.js', 'utf8');

for (const token of ["paymentMode: 'sandbox'", 'liveMoney: false', "version: '3.0.0'"]) {
  if (!health.includes(token)) throw new Error(`health contract missing ${token}`);
}
for (const token of ['RSP-056', 'RICHO-AQF-COURSE', 'RICHO-AQF-SESSION', '1900', '4900', '19700']) {
  if (!offers.includes(token)) throw new Error(`offer contract missing ${token}`);
}
if (!checkout.includes("reason: 'preview_sandbox_only'")) throw new Error('checkout is not blocked by default');
for (const token of ['timingSafeEqual', 'createHmac', 'preview_no_side_effects', 'processed: false', 'liveMoney: false']) {
  if (!webhook.includes(token)) throw new Error(`webhook safety contract missing ${token}`);
}
if (!db.includes("sslmode', 'verify-full")) throw new Error('strict TLS normalization missing');

console.log('PayCore reconstruction contract PASSED');

const test = require('node:test');
const assert = require('node:assert/strict');

const { readinessState, getCheckoutLink, appendCheckoutEmail } = require('../app.js');

test('readinessState returns expected status buckets', () => {
  assert.equal(readinessState(90)[0], 'READY FOR HUMAN REVIEW');
  assert.equal(readinessState(70)[0], 'CONDITIONAL');
  assert.equal(readinessState(20)[0], 'BLOCKED');
});

test('getCheckoutLink only accepts Stripe Checkout links', () => {
  global.window = { RICHO_STRIPE_LINKS: { valid: 'https://buy.stripe.com/test_123', invalid: 'https://example.com/not-stripe' } };
  assert.equal(getCheckoutLink('valid'), 'https://buy.stripe.com/test_123');
  assert.equal(getCheckoutLink('invalid'), '');
  delete global.window;
});

test('appendCheckoutEmail adds normalized prefilled email', () => {
  const url = appendCheckoutEmail('https://buy.stripe.com/test_123?x=1', 'USER@EXAMPLE.COM');
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('x'), '1');
  assert.equal(parsed.searchParams.get('prefilled_email'), 'user@example.com');
});

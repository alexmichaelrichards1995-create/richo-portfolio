const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-at-least-32-characters';
process.env.GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'test-webhook-secret';
process.env.GITHUB_APP_ID = process.env.GITHUB_APP_ID || '123456';

const {
  verifyWebhookSignature,
  createAppJwt,
  planTier,
  featuresForTier,
  makeSignedToken,
  readSignedToken,
} = require('../src/server');

test('validates GitHub HMAC SHA-256 webhook signatures', () => {
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));
  const secret = 'top-secret';
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(verifyWebhookSignature(body, signature, secret), true);
  assert.equal(verifyWebhookSignature(body, `${signature.slice(0, -1)}0`, secret), false);
  assert.equal(verifyWebhookSignature(body, '', secret), false);
});

test('creates a verifiable RS256 GitHub App JWT with bounded lifetime', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.GITHUB_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const now = 1_800_000_000;
  const token = createAppJwt(now);
  const [headerPart, payloadPart, signaturePart] = token.split('.');
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  assert.equal(header.alg, 'RS256');
  assert.equal(payload.iss, '123456');
  assert.equal(payload.iat, now - 60);
  assert.equal(payload.exp, now + 540);
  const valid = crypto.verify('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), publicKey, Buffer.from(signaturePart, 'base64url'));
  assert.equal(valid, true);
});

test('signed session tokens reject tampering and expiry', () => {
  const secret = 'session-secret';
  const token = makeSignedToken({ user: 7, exp: Math.floor(Date.now() / 1000) + 60 }, secret);
  assert.equal(readSignedToken(token, secret).user, 7);
  assert.equal(readSignedToken(`${token}x`, secret), null);
  const expired = makeSignedToken({ user: 7, exp: 1 }, secret);
  assert.equal(readSignedToken(expired, secret), null);
});

test('maps Marketplace plan names to server-side entitlements', () => {
  assert.equal(planTier('Starter'), 'starter');
  assert.equal(planTier('Professional'), 'professional');
  assert.equal(planTier('Business Team'), 'business');
  assert.equal(planTier('Enterprise'), 'enterprise');
  assert.equal(planTier('Unknown'), 'free');
  assert.ok(featuresForTier('professional').includes('api_access'));
  assert.ok(!featuresForTier('free').includes('api_access'));
});

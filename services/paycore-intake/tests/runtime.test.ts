import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  checkoutConfigured,
  configured,
  encryptJson,
  productFor,
  trustedOrigins,
  validIdempotencyKey,
  webhookConfigured,
} from "../lib/runtime";

test("canonical public prices remain server-owned", () => {
  assert.equal(productFor("RSP-056").amountMinor, 1900);
  assert.equal(productFor("RICHO-AIQF-COURSE-049").amountMinor, 4900);
  assert.equal(productFor("RICHO-AIQF-SESSION-197").amountMinor, 19700);
  assert.throws(() => productFor("RICHO-OIP-001"), /controlled_offer_not_public_checkout/);
  assert.throws(() => productFor("UNKNOWN"), /unknown_sku/);
});

test("checkout and webhook readiness are fail closed", () => {
  const empty = {};
  assert.equal(checkoutConfigured(empty), false);
  assert.equal(webhookConfigured(empty), false);

  const checkoutEnv = {
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    DATABASE_URL: "postgres://placeholder",
    PAYCORE_PII_ENCRYPTION_KEY: "a".repeat(64),
    EMAIL_HASH_PEPPER: "pepper-pepper-pepper",
    NEXT_PUBLIC_SITE_URL: "https://example.com",
  };
  assert.equal(checkoutConfigured(checkoutEnv), true);
  assert.equal(webhookConfigured(checkoutEnv), false);
  assert.equal(configured(checkoutEnv).stripe_webhook, false);
});

test("idempotency keys are bounded and hostile values are rejected", () => {
  assert.equal(validIdempotencyKey("sale-1234567890123456"), "sale-1234567890123456");
  assert.equal(validIdempotencyKey("short"), null);
  assert.equal(validIdempotencyKey("bad key with spaces 123456"), null);
  assert.equal(validIdempotencyKey("x".repeat(201)), null);
});

test("customer payload encryption produces AES-GCM envelope without plaintext", () => {
  const encrypted = encryptJson({ email: "buyer@example.com" }, "a".repeat(64));
  assert.equal(encrypted.alg, "A256GCM");
  assert.equal(encrypted.v, 1);
  assert.ok(encrypted.iv.length > 10);
  assert.ok(encrypted.tag.length > 10);
  assert.ok(!JSON.stringify(encrypted).includes("buyer@example.com"));
});

test("trusted origins normalize and reject malformed optional values", () => {
  const origins = trustedOrigins({
    NEXT_PUBLIC_SITE_URL: "https://pay.example.com/path",
    CHECKOUT_ALLOWED_ORIGINS: "https://richosystems.technology,not-a-url, https://shop.example.com/path",
  });
  assert.deepEqual([...origins].sort(), ["https://pay.example.com", "https://richosystems.technology", "https://shop.example.com"].sort());
});

test("production build is transparent and cannot depend on bootstrap.mjs", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.version, "2.2.1");
  assert.ok(!String(pkg.scripts.build).includes("bootstrap.mjs"));
  assert.equal(fs.existsSync(path.join(root, "bootstrap.mjs")), false);
});

test("webhook route verifies Stripe signature before processing", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const source = fs.readFileSync(path.join(root, "app/api/stripe/webhook/route.ts"), "utf8");
  const rawIndex = source.indexOf("request.text()");
  const verifyIndex = source.indexOf("constructEvent");
  const processIndex = source.indexOf("await processStripeEvent(");
  assert.ok(rawIndex >= 0 && verifyIndex > rawIndex && processIndex > verifyIndex);
  assert.match(source, /missing_stripe_signature/);
  assert.match(source, /invalid_webhook_signature/);
});

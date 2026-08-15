import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";
import { z } from "zod";

export const SERVICE = "richo-stripe-payment-event-intake";
export const VERSION = "2.2.1";

const envSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  PAYCORE_PII_ENCRYPTION_KEY: z.string().min(1).optional(),
  EMAIL_HASH_PEPPER: z.string().min(16).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  STRIPE_EXPECTED_ACCOUNT_ID: z.string().regex(/^acct_[A-Za-z0-9]+$/).optional(),
  CHECKOUT_ALLOWED_ORIGINS: z.string().optional(),
});

export type RuntimeEnv = z.infer<typeof envSchema>;
export type SqlClient = ReturnType<typeof neon>;

export class PayCoreError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(code: string, options: { httpStatus?: number; retryable?: boolean } = {}) {
    super(code);
    this.name = "PayCoreError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? 400;
    this.retryable = options.retryable ?? false;
  }
}

export function readRuntimeEnv(): RuntimeEnv {
  return envSchema.parse(process.env);
}

const CHECKOUT_KEYS = [
  "STRIPE_SECRET_KEY",
  "DATABASE_URL",
  "PAYCORE_PII_ENCRYPTION_KEY",
  "EMAIL_HASH_PEPPER",
  "NEXT_PUBLIC_SITE_URL",
] as const;

const WEBHOOK_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "DATABASE_URL",
  "PAYCORE_PII_ENCRYPTION_KEY",
  "EMAIL_HASH_PEPPER",
] as const;

export function configured(env: RuntimeEnv) {
  return {
    stripe_api: Boolean(env.STRIPE_SECRET_KEY),
    stripe_webhook: Boolean(env.STRIPE_WEBHOOK_SECRET),
    database: Boolean(env.DATABASE_URL),
    pii_encryption: Boolean(env.PAYCORE_PII_ENCRYPTION_KEY),
    email_pepper: Boolean(env.EMAIL_HASH_PEPPER),
    public_origin: Boolean(env.NEXT_PUBLIC_SITE_URL),
    stripe_account_pin: Boolean(env.STRIPE_EXPECTED_ACCOUNT_ID),
  };
}

export function checkoutConfigured(env: RuntimeEnv): boolean {
  return CHECKOUT_KEYS.every((key) => Boolean(env[key]));
}

export function webhookConfigured(env: RuntimeEnv): boolean {
  return WEBHOOK_KEYS.every((key) => Boolean(env[key]));
}

export function requireCheckoutEnv(env = readRuntimeEnv()) {
  if (!checkoutConfigured(env)) throw new PayCoreError("checkout_not_configured", { httpStatus: 503 });
  return env as RuntimeEnv & Required<Pick<RuntimeEnv,
    "STRIPE_SECRET_KEY" | "DATABASE_URL" | "PAYCORE_PII_ENCRYPTION_KEY" | "EMAIL_HASH_PEPPER" | "NEXT_PUBLIC_SITE_URL"
  >>;
}

export function requireWebhookEnv(env = readRuntimeEnv()) {
  if (!webhookConfigured(env)) throw new PayCoreError("webhook_not_configured", { httpStatus: 503 });
  return env as RuntimeEnv & Required<Pick<RuntimeEnv,
    "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" | "DATABASE_URL" | "PAYCORE_PII_ENCRYPTION_KEY" | "EMAIL_HASH_PEPPER"
  >>;
}

export function database(url: string): SqlClient {
  return neon(url, { fullResults: false });
}

export async function pingDatabase(url: string): Promise<boolean> {
  try {
    const sql = database(url);
    await sql`SELECT 1 AS ok`;
    return true;
  } catch {
    return false;
  }
}

export function stripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    maxNetworkRetries: 2,
    timeout: 15_000,
    appInfo: { name: "R.I.C.H.O. PayCore Intake", version: VERSION, url: "https://richosystems.technology" },
  });
}

export async function verifyStripeAccount(secretKey: string, expected?: string): Promise<{ ok: boolean; accountPinned: boolean }> {
  try {
    const account = await stripeClient(secretKey).accounts.retrieve();
    if (expected && account.id !== expected) return { ok: false, accountPinned: true };
    return { ok: true, accountPinned: Boolean(expected) };
  } catch {
    return { ok: false, accountPinned: Boolean(expected) };
  }
}

export type Product = Readonly<{
  sku: string;
  name: string;
  amountMinor: number;
  currency: "aud";
  releaseVersion: string;
  fulfilmentMode: "buyer_zip" | "booking_handoff";
}>;

export const PRODUCTS = {
  "RSP-056": {
    sku: "RSP-056",
    name: "R.I.C.H.O. AI Business Quick-Wins Kit",
    amountMinor: 1900,
    currency: "aud",
    releaseVersion: "2.0.0",
    fulfilmentMode: "buyer_zip",
  },
  "RICHO-AIQF-COURSE-049": {
    sku: "RICHO-AIQF-COURSE-049",
    name: "AI Quick Fix for Small Business",
    amountMinor: 4900,
    currency: "aud",
    releaseVersion: "1.0.0",
    fulfilmentMode: "buyer_zip",
  },
  "RICHO-AIQF-SESSION-197": {
    sku: "RICHO-AIQF-SESSION-197",
    name: "AI Quick Fix Session",
    amountMinor: 19700,
    currency: "aud",
    releaseVersion: "1.0.0",
    fulfilmentMode: "booking_handoff",
  },
} as const satisfies Record<string, Product>;

const CONTROLLED_SKUS = new Set(["RICHO-OIP-001"]);

export function productFor(sku: string): Product {
  if (CONTROLLED_SKUS.has(sku)) throw new PayCoreError("controlled_offer_not_public_checkout", { httpStatus: 403 });
  const product = (PRODUCTS as Record<string, Product>)[sku];
  if (!product) throw new PayCoreError("unknown_sku", { httpStatus: 404 });
  return product;
}

export function trustedOrigins(env: RuntimeEnv): Set<string> {
  const origins = new Set<string>();
  if (env.NEXT_PUBLIC_SITE_URL) origins.add(new URL(env.NEXT_PUBLIC_SITE_URL).origin);
  for (const value of (env.CHECKOUT_ALLOWED_ORIGINS ?? "").split(",")) {
    const candidate = value.trim();
    if (!candidate) continue;
    try { origins.add(new URL(candidate).origin); } catch { /* ignore invalid optional origin */ }
  }
  return origins;
}

function keyFromText(input: string): Buffer {
  const value = input.trim();
  if (/^[a-fA-F0-9]{64}$/.test(value)) return Buffer.from(value, "hex");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const key = Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64");
  if (key.length !== 32) throw new PayCoreError("invalid_pii_encryption_key", { httpStatus: 503 });
  return key;
}

export function encryptJson(value: unknown, keyText: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromText(keyText), iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), "utf8")), cipher.final()]);
  return {
    v: 1,
    alg: "A256GCM",
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function hmacHash(value: string, pepper: string): string {
  return crypto.createHmac("sha256", pepper).update(value.trim().toLowerCase()).digest("hex");
}

export function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function validIdempotencyKey(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{16,200}$/.test(trimmed) ? trimmed : null;
}

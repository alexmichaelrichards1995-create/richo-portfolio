/* airwallex_integration.js
 * Sandbox-first Airwallex Payments client for R.I.C.H.O. PayCore.
 *
 * Security boundaries:
 * - Client ID / API key stay server-side only.
 * - Sandbox is the default environment.
 * - Production is blocked unless AIRWALLEX_ALLOW_PRODUCTION=true.
 * - Payment amounts must originate from trusted server-side order data.
 */

const crypto = require('crypto');

const ENVIRONMENTS = Object.freeze({
  demo: 'https://api.sandbox.airwallex.com',
  sandbox: 'https://api.sandbox.airwallex.com',
  production: 'https://api.airwallex.com',
  prod: 'https://api.airwallex.com',
});

class AirwallexError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AirwallexError';
    this.status = options.status || null;
    this.code = options.code || null;
    this.details = options.details || null;
  }
}

function assertNonEmpty(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }
}

function assertAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError('amount must be a positive finite number');
  }
}

function assertCurrency(value) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw new TypeError('currency must be a 3-letter uppercase ISO currency code');
  }
}

function resolveEnvironment(environment = 'sandbox', allowProduction = false) {
  const normalized = String(environment).toLowerCase();
  const baseUrl = ENVIRONMENTS[normalized];
  if (!baseUrl) throw new TypeError(`unsupported Airwallex environment: ${environment}`);

  const isProduction = normalized === 'production' || normalized === 'prod';
  if (isProduction && !allowProduction) {
    throw new Error('Airwallex production access is locked. Set AIRWALLEX_ALLOW_PRODUCTION=true only after owner approval and production readiness checks.');
  }

  return { normalized, baseUrl, isProduction };
}

function parseJsonSafely(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return { raw: text };
  }
}

function createAirwallexClient(options = {}) {
  const clientId = options.clientId || process.env.AIRWALLEX_CLIENT_ID;
  const apiKey = options.apiKey || process.env.AIRWALLEX_API_KEY;
  const environment = options.environment || process.env.AIRWALLEX_ENV || 'sandbox';
  const allowProduction = options.allowProduction ?? process.env.AIRWALLEX_ALLOW_PRODUCTION === 'true';
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || (() => Date.now());
  const tokenSkewMs = options.tokenSkewMs ?? 60_000;

  assertNonEmpty(clientId, 'AIRWALLEX_CLIENT_ID');
  assertNonEmpty(apiKey, 'AIRWALLEX_API_KEY');
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation is available. Use Node.js 18+ or inject fetchImpl.');
  }

  const env = resolveEnvironment(environment, allowProduction);
  let tokenCache = null;

  async function rawRequest(path, request = {}) {
    const url = `${env.baseUrl}${path}`;
    const response = await fetchImpl(url, request);
    const text = typeof response.text === 'function' ? await response.text() : '';
    const data = parseJsonSafely(text);

    if (!response.ok) {
      const code = data && (data.code || data.error_code || data.name);
      const message = data && (data.message || data.error_description || data.error);
      throw new AirwallexError(message || `Airwallex request failed with HTTP ${response.status}`, {
        status: response.status,
        code: code || null,
        details: data,
      });
    }

    return data;
  }

  async function getAccessToken({ force = false } = {}) {
    if (!force && tokenCache && tokenCache.expiresAtMs - tokenSkewMs > now()) {
      return tokenCache.token;
    }

    const data = await rawRequest('/api/v1/authentication/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': clientId,
        'x-api-key': apiKey,
      },
    });

    if (!data || !data.token) throw new AirwallexError('Airwallex authentication response did not include a token');

    const parsedExpiry = Date.parse(data.expires_at || '');
    tokenCache = {
      token: data.token,
      expiresAtMs: Number.isFinite(parsedExpiry) ? parsedExpiry : now() + 30 * 60_000,
    };
    return tokenCache.token;
  }

  async function authenticatedRequest(path, request = {}) {
    const token = await getAccessToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(request.headers || {}),
      Authorization: `Bearer ${token}`,
    };
    return rawRequest(path, { ...request, headers });
  }

  async function createPaymentIntent(input = {}) {
    assertAmount(input.amount);
    assertCurrency(input.currency);
    assertNonEmpty(input.merchantOrderId, 'merchantOrderId');

    const payload = {
      request_id: input.requestId || crypto.randomUUID(),
      amount: input.amount,
      currency: input.currency,
      merchant_order_id: input.merchantOrderId,
    };

    if (input.returnUrl) payload.return_url = input.returnUrl;
    if (input.customer && typeof input.customer === 'object') {
      payload.customer = input.customer;
    }

    return authenticatedRequest('/api/v1/pa/payment_intents/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async function retrievePaymentIntent(paymentIntentId) {
    assertNonEmpty(paymentIntentId, 'paymentIntentId');
    return authenticatedRequest(`/api/v1/pa/payment_intents/${encodeURIComponent(paymentIntentId)}`);
  }

  function readiness() {
    return {
      provider: 'airwallex',
      environment: env.isProduction ? 'production' : 'sandbox',
      baseUrl: env.baseUrl,
      configured: Boolean(clientId && apiKey),
      productionUnlocked: env.isProduction && allowProduction,
      credentialsExposed: false,
    };
  }

  return {
    getAccessToken,
    createPaymentIntent,
    retrievePaymentIntent,
    readiness,
  };
}

module.exports = {
  AirwallexError,
  createAirwallexClient,
  resolveEnvironment,
};

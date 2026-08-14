const crypto = require('crypto');
const express = require('express');
const { PaymentStore } = require('./airwallex_payment_store');

const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

function verifyAirwallexSignature({ rawBody, timestamp, signature, secret, now = Date.now(), toleranceMs = DEFAULT_TOLERANCE_MS }) {
  if (!Buffer.isBuffer(rawBody)) throw new Error('rawBody must be a Buffer');
  if (!secret) return { ok: false, reason: 'missing_secret' };
  if (!timestamp || !signature) return { ok: false, reason: 'missing_headers' };

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs)) return { ok: false, reason: 'invalid_timestamp' };
  if (Math.abs(now - timestampMs) > toleranceMs) return { ok: false, reason: 'stale_timestamp' };
  if (!/^[a-f0-9]{64}$/i.test(signature)) return { ok: false, reason: 'invalid_signature_format' };

  const expected = crypto
    .createHmac('sha256', secret)
    .update(String(timestamp))
    .update(rawBody)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  if (expectedBuffer.length !== actualBuffer.length) return { ok: false, reason: 'signature_mismatch' };

  const ok = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  return { ok, reason: ok ? null : 'signature_mismatch' };
}

function createAirwallexWebhookRouter(options = {}) {
  const router = express.Router();
  const store = options.store || new PaymentStore();
  const secret = options.secret || process.env.AIRWALLEX_WEBHOOK_SECRET || '';
  const toleranceMs = options.toleranceMs || DEFAULT_TOLERANCE_MS;
  const now = options.now || (() => Date.now());

  router.post('/airwallex', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) return res.status(400).json({ error: 'raw_body_required' });

    const verification = verifyAirwallexSignature({
      rawBody,
      timestamp: req.get('x-timestamp'),
      signature: req.get('x-signature'),
      secret,
      now: now(),
      toleranceMs,
    });

    if (!verification.ok) {
      const status = verification.reason === 'missing_secret' ? 503 : 401;
      return res.status(status).json({ error: verification.reason });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch (_) {
      return res.status(400).json({ error: 'invalid_json' });
    }

    if (!event?.id || !event?.name) return res.status(400).json({ error: 'invalid_event' });

    // Only payment-intent lifecycle events change the payment ledger.
    // Unknown event families are acknowledged safely so Airwallex does not retry forever.
    if (!String(event.name).startsWith('payment_intent.')) {
      return res.status(200).json({ received: true, ignored: true });
    }

    try {
      const result = await store.applyPaymentEvent(event);
      return res.status(200).json({
        received: true,
        duplicate: Boolean(result.duplicate),
        updated: Boolean(result.updated),
      });
    } catch (error) {
      console.error('Airwallex webhook processing failed', error && error.message);
      // Non-200 intentionally asks Airwallex to retry transient processing failures.
      return res.status(500).json({ error: 'processing_failed' });
    }
  });

  return router;
}

module.exports = {
  DEFAULT_TOLERANCE_MS,
  verifyAirwallexSignature,
  createAirwallexWebhookRouter,
};

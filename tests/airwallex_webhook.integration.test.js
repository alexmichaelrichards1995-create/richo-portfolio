const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { verifyAirwallexSignature } = require('../airwallex_webhook_handler');
const { PaymentStore } = require('../airwallex_payment_store');

function sign(secret, timestamp, rawBody) {
  return crypto.createHmac('sha256', secret).update(String(timestamp)).update(rawBody).digest('hex');
}

(async () => {
  const secret = 'airwallex-test-secret';
  const timestamp = 1786690800000;
  const rawBody = Buffer.from(JSON.stringify({ id: 'evt_sig', name: 'payment_intent.created', data: { object: { id: 'int_sig' } } }));
  const signature = sign(secret, timestamp, rawBody);

  const valid = verifyAirwallexSignature({ rawBody, timestamp, signature, secret, now: timestamp + 1000 });
  assert.equal(valid.ok, true, 'valid signature should pass');

  const invalid = verifyAirwallexSignature({ rawBody, timestamp, signature: '0'.repeat(64), secret, now: timestamp + 1000 });
  assert.equal(invalid.ok, false, 'invalid signature should fail');

  const stale = verifyAirwallexSignature({ rawBody, timestamp, signature, secret, now: timestamp + (6 * 60 * 1000) });
  assert.equal(stale.ok, false, 'stale signature should fail');
  assert.equal(stale.reason, 'stale_timestamp');

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'richo-airwallex-'));
  const filePath = path.join(dir, 'ledger.json');
  const store = new PaymentStore({ forceFile: true, filePath });

  const succeeded = {
    id: 'evt_success_1',
    name: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'int_100',
        merchant_order_id: 'RICHO-ORDER-100',
        amount: 197,
        currency: 'AUD',
        status: 'SUCCEEDED',
        created_at: '2026-08-14T07:00:00+0000',
        updated_at: '2026-08-14T07:05:00+0000',
      },
    },
  };

  const first = await store.applyPaymentEvent(succeeded);
  assert.equal(first.duplicate, false);
  assert.equal(first.updated, true);

  const duplicate = await store.applyPaymentEvent(succeeded);
  assert.equal(duplicate.duplicate, true, 'same event id must be idempotent');

  const olderPending = {
    id: 'evt_pending_old',
    name: 'payment_intent.pending',
    data: {
      object: {
        id: 'int_100',
        merchant_order_id: 'RICHO-ORDER-100',
        amount: 197,
        currency: 'AUD',
        status: 'PENDING',
        created_at: '2026-08-14T07:00:00+0000',
        updated_at: '2026-08-14T07:03:00+0000',
      },
    },
  };

  const oldResult = await store.applyPaymentEvent(olderPending);
  assert.equal(oldResult.updated, false, 'older event must not overwrite newer state');

  const payment = await store.getPayment('int_100');
  assert.equal(payment.paymentStatus, 'SUCCEEDED');
  assert.equal(payment.merchantOrderId, 'RICHO-ORDER-100');
  assert.equal(payment.amount, 197);
  assert.equal(payment.currency, 'AUD');

  await fs.promises.rm(dir, { recursive: true, force: true });
  console.log('OK: Airwallex webhook signature, replay protection, idempotency, and ordering tests passed');
})().catch((error) => {
  console.error('FAILED', error && error.stack ? error.stack : error);
  process.exit(1);
});

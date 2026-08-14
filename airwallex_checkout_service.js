/* airwallex_checkout_service.js
 * Converts a trusted server-side R.I.C.H.O. order into an Airwallex PaymentIntent.
 * Public clients supply only an order identifier; amount/currency are resolved on the server.
 */

const crypto = require('crypto');

function createAirwallexCheckoutService(options = {}) {
  const airwallexClient = options.airwallexClient;
  const resolveOrder = options.resolveOrder;
  const defaultReturnUrl = options.defaultReturnUrl || null;

  if (!airwallexClient || typeof airwallexClient.createPaymentIntent !== 'function') {
    throw new TypeError('airwallexClient with createPaymentIntent() is required');
  }
  if (typeof resolveOrder !== 'function') {
    throw new TypeError('resolveOrder(orderId) is required');
  }

  async function createCheckout(input = {}) {
    const orderId = input.orderId;
    if (typeof orderId !== 'string' || !orderId.trim()) {
      throw new TypeError('orderId is required');
    }

    const order = await resolveOrder(orderId);
    if (!order) throw new Error('order_not_found');
    if (order.payable === false) throw new Error('order_not_payable');
    if (typeof order.amount !== 'number' || !Number.isFinite(order.amount) || order.amount <= 0) {
      throw new Error('order_amount_invalid');
    }
    if (typeof order.currency !== 'string' || !/^[A-Z]{3}$/.test(order.currency)) {
      throw new Error('order_currency_invalid');
    }

    const merchantOrderId = String(order.merchantOrderId || order.id || orderId);
    const requestId = String(order.paymentRequestId || crypto.randomUUID());
    const returnUrl = order.returnUrl || defaultReturnUrl || undefined;

    const customer = input.customer && typeof input.customer === 'object'
      ? sanitizeCustomer(input.customer)
      : undefined;

    const intent = await airwallexClient.createPaymentIntent({
      requestId,
      amount: order.amount,
      currency: order.currency,
      merchantOrderId,
      returnUrl,
      customer,
    });

    return {
      provider: 'airwallex',
      orderId,
      merchantOrderId,
      paymentIntentId: intent && intent.id,
      clientSecret: intent && intent.client_secret,
      currency: order.currency,
      amount: order.amount,
      status: intent && intent.status,
    };
  }

  return { createCheckout };
}

function sanitizeCustomer(customer) {
  const safe = {};
  for (const field of ['email', 'first_name', 'last_name', 'phone_number']) {
    if (typeof customer[field] === 'string' && customer[field].trim()) {
      safe[field] = customer[field].trim();
    }
  }
  return Object.keys(safe).length ? safe : undefined;
}

module.exports = { createAirwallexCheckoutService, sanitizeCustomer };

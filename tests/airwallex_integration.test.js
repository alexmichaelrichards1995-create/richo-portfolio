// Tests for Airwallex sandbox client and trusted-order checkout service.
// Run: node tests/airwallex_integration.test.js

const { createAirwallexClient, resolveEnvironment } = require('../airwallex_integration');
const { createAirwallexCheckoutService } = require('../airwallex_checkout_service');

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body == null ? '' : JSON.stringify(body); },
  };
}

(async () => {
  try {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith('/api/v1/authentication/login')) {
        return response(200, {
          token: 'sandbox_access_token',
          expires_at: '2099-01-01T00:00:00Z',
        });
      }
      if (url.endsWith('/api/v1/pa/payment_intents/create')) {
        const payload = JSON.parse(options.body);
        return response(201, {
          id: 'int_test_123',
          client_secret: 'client_secret_test',
          status: 'REQUIRES_PAYMENT_METHOD',
          amount: payload.amount,
          currency: payload.currency,
          merchant_order_id: payload.merchant_order_id,
        });
      }
      if (url.endsWith('/api/v1/pa/payment_intents/int_test_123')) {
        return response(200, { id: 'int_test_123', status: 'SUCCEEDED' });
      }
      return response(404, { code: 'not_found' });
    };

    const client = createAirwallexClient({
      clientId: 'sandbox_client',
      apiKey: 'sandbox_key',
      environment: 'sandbox',
      fetchImpl,
    });

    const readiness = client.readiness();
    if (readiness.environment !== 'sandbox') throw new Error('sandbox must be default-safe');
    if (readiness.credentialsExposed !== false) throw new Error('readiness must not expose credentials');

    const token1 = await client.getAccessToken();
    const token2 = await client.getAccessToken();
    if (token1 !== 'sandbox_access_token' || token2 !== token1) throw new Error('token caching failed');
    if (calls.filter(c => c.url.endsWith('/authentication/login')).length !== 1) throw new Error('authentication should be cached');

    const service = createAirwallexCheckoutService({
      airwallexClient: client,
      defaultReturnUrl: 'https://richosystems.technology/payment-result',
      async resolveOrder(orderId) {
        if (orderId !== 'ORDER-197') return null;
        return {
          id: orderId,
          amount: 197,
          currency: 'AUD',
          payable: true,
        };
      },
    });

    const checkout = await service.createCheckout({
      orderId: 'ORDER-197',
      amount: 0.01, // attacker-controlled value must be ignored by the service
      customer: {
        email: 'buyer@example.com',
        first_name: 'Test',
        ignored_field: 'must not be forwarded',
      },
    });

    if (checkout.amount !== 197 || checkout.currency !== 'AUD') throw new Error('checkout must use trusted server order amount/currency');
    if (checkout.paymentIntentId !== 'int_test_123') throw new Error('payment intent result mismatch');

    const createCall = calls.find(c => c.url.endsWith('/payment_intents/create'));
    const payload = JSON.parse(createCall.options.body);
    if (payload.amount !== 197) throw new Error('client-supplied amount leaked into payment intent');
    if (payload.currency !== 'AUD') throw new Error('currency mismatch');
    if (payload.merchant_order_id !== 'ORDER-197') throw new Error('merchant order id mismatch');
    if (payload.customer.ignored_field) throw new Error('unsafe customer field forwarded');
    if (!createCall.options.headers.Authorization.startsWith('Bearer ')) throw new Error('missing bearer token');

    const retrieved = await client.retrievePaymentIntent('int_test_123');
    if (retrieved.status !== 'SUCCEEDED') throw new Error('retrieve payment intent failed');

    let productionBlocked = false;
    try {
      resolveEnvironment('production', false);
    } catch (err) {
      productionBlocked = /locked/.test(err.message);
    }
    if (!productionBlocked) throw new Error('production environment must be gated');

    console.log('OK: Airwallex sandbox integration tests passed');
    process.exit(0);
  } catch (err) {
    console.error('FAILED', err && err.message);
    process.exit(1);
  }
})();

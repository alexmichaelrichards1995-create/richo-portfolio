(() => {
  'use strict';

  const buttons = Array.from(document.querySelectorAll('[data-richo-checkout-sku]'));
  if (!buttons.length) return;

  const status = document.getElementById('checkout-status');
  const pendingKeys = new Map();

  function announce(message, state = '') {
    if (!status) return;
    status.textContent = message;
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  }

  function makeIdempotencyKey(sku) {
    const random = globalThis.crypto?.randomUUID?.();
    if (random) return `richo-web-${sku}-${random}`;

    const bytes = new Uint8Array(16);
    globalThis.crypto?.getRandomValues?.(bytes);
    const entropy = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return `richo-web-${sku}-${Date.now()}-${entropy || Math.random().toString(36).slice(2)}`;
  }

  function safeCheckoutUrl(value) {
    let parsed;
    try {
      parsed = new URL(String(value || ''));
    } catch (_) {
      return null;
    }

    if (parsed.protocol !== 'https:') return null;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== 'checkout.stripe.com' && !hostname.endsWith('.checkout.stripe.com')) return null;
    return parsed.toString();
  }

  function track(event, properties) {
    window.RICHOAnalytics?.track?.(event, properties);
  }

  async function beginCheckout(button) {
    const sku = String(button.dataset.richoCheckoutSku || '').trim();
    if (!sku || button.disabled) return;

    const originalText = button.textContent;
    const idempotencyKey = pendingKeys.get(button) || makeIdempotencyKey(sku);
    pendingKeys.set(button, idempotencyKey);

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Opening secure checkout…';
    announce('Creating your secure Stripe checkout…', 'loading');

    track('richo_cta_clicked', {
      cta_label: originalText.trim().slice(0, 120),
      destination_type: 'paycore_checkout_api',
      sku,
    });

    try {
      const response = await fetch(`/api/checkout/${encodeURIComponent(sku)}`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (_) {
        payload = null;
      }

      if (!response.ok) {
        const code = payload?.error || `http_${response.status}`;
        const error = new Error(code);
        error.code = code;
        throw error;
      }

      const checkoutUrl = safeCheckoutUrl(payload?.checkoutUrl);
      if (!checkoutUrl) {
        const error = new Error('invalid_checkout_url');
        error.code = 'invalid_checkout_url';
        throw error;
      }

      track('richo_checkout_started', {
        source_cta: originalText.trim().slice(0, 120),
        source: 'paycore_checkout_api',
        sku: String(payload?.sku || sku).slice(0, 100),
        amount_minor: Number(payload?.amountMinor) || undefined,
        currency: String(payload?.currency || '').slice(0, 3),
        stripe_mode: String(payload?.stripeMode || '').slice(0, 16),
      });

      announce('Secure checkout created. Redirecting to Stripe…', 'success');
      window.location.assign(checkoutUrl);
    } catch (error) {
      const code = String(error?.code || error?.message || 'checkout_unavailable');
      const friendly = code === 'checkout_not_configured'
        ? 'Secure checkout is not active yet.'
        : code === 'idempotency_conflict'
          ? 'This checkout request changed. Please try again.'
          : 'Checkout could not be opened. Please try again.';

      track('richo_checkout_failed', {
        source: 'paycore_checkout_api',
        sku,
        error_code: code.slice(0, 80),
      });

      announce(friendly, 'error');
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = originalText;
      pendingKeys.delete(button);
    }
  }

  buttons.forEach(button => {
    button.addEventListener('click', () => beginCheckout(button));
  });
})();

(() => {
  'use strict';

  const POSTHOG_KEY = 'phc_xdyhBomR4xM4AJYXD9gmhVqjMyqvq4JxuSZKRb5Mrd5L';
  const POSTHOG_HOST = 'https://us.i.posthog.com';
  const POSTHOG_ASSET_HOST = 'https://us-assets.i.posthog.com';

  const safeText = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);

  const queue = [];
  let initialized = false;

  function capture(event, properties = {}) {
    const payload = {
      site: 'richo-product-runtime',
      ...properties
    };

    if (initialized && window.posthog?.capture) {
      window.posthog.capture(event, payload);
      return;
    }

    queue.push([event, payload]);
  }

  function flushQueue() {
    if (!initialized || !window.posthog?.capture) return;
    while (queue.length) {
      const [event, properties] = queue.shift();
      window.posthog.capture(event, properties);
    }
  }

  function initPostHog() {
    if (!window.posthog?.init || initialized) return;

    window.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      ui_host: 'https://us.posthog.com',
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      disable_session_recording: true,
      respect_dnt: true
    });

    initialized = true;
    flushQueue();
  }

  window.RICHOAnalytics = Object.freeze({
    track: capture,
    isReady: () => initialized
  });

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `${POSTHOG_ASSET_HOST}/static/array.js`;
  script.addEventListener('load', initPostHog, { once: true });
  script.addEventListener('error', () => {
    console.warn('R.I.C.H.O. analytics unavailable; site functionality is unaffected.');
  }, { once: true });
  document.head.appendChild(script);

  document.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;

    const isCommercialCta = link.matches('.button, .product-card a, nav a[href*="richosystems.technology"], footer a[href*="richosystems.technology"]');
    if (!isCommercialCta) return;

    const href = link.getAttribute('href') || '';
    const destinationType = href.startsWith('#') ? 'internal_anchor' : 'external_or_page';

    capture('richo_cta_clicked', {
      cta_label: safeText(link.textContent),
      destination: safeText(href),
      destination_type: destinationType
    });

    if (/checkout|buy|payment|stripe/i.test(href)) {
      capture('richo_checkout_started', {
        source_cta: safeText(link.textContent),
        destination: safeText(href)
      });
    }
  });
})();

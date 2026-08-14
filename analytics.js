(() => {
  'use strict';

  const POSTHOG_KEY = 'phc_xdyhBomR4xM4AJYXD9gmhVqjMyqvq4JxuSZKRb5Mrd5L';
  const POSTHOG_HOST = 'https://us.i.posthog.com';
  const POSTHOG_UI_HOST = 'https://us.posthog.com';

  const safeText = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);

  function installPostHogQueue() {
    if (window.posthog?.capture) return window.posthog;

    const stub = [];
    stub._i = [];
    stub.__SV = 1;

    const queueMethod = method => {
      stub[method] = (...args) => stub.push([method, ...args]);
    };

    [
      'capture',
      'identify',
      'register',
      'register_once',
      'unregister',
      'opt_in_capturing',
      'opt_out_capturing',
      'has_opted_in_capturing',
      'has_opted_out_capturing',
      'reset',
      'set_config'
    ].forEach(queueMethod);

    stub.init = (token, config = {}, name = 'posthog') => {
      stub._i.push([token, config, name]);

      const existing = document.querySelector('script[data-richo-posthog]');
      if (existing) return stub;

      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.richoPosthog = 'true';
      script.src = `${config.api_host.replace('.i.posthog.com', '-assets.i.posthog.com')}/static/array.js`;
      script.addEventListener('error', () => {
        console.warn('R.I.C.H.O. analytics unavailable; site functionality is unaffected.');
      }, { once: true });
      document.head.appendChild(script);
      return stub;
    };

    window.posthog = stub;
    return stub;
  }

  const posthog = installPostHogQueue();
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: POSTHOG_UI_HOST,
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true,
    respect_dnt: true
  });

  function capture(event, properties = {}) {
    window.posthog?.capture?.(event, {
      site: 'richo-product-runtime',
      ...properties
    });
  }

  window.RICHOAnalytics = Object.freeze({
    track: capture,
    isReady: () => Boolean(window.posthog?.capture)
  });

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

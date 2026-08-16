(() => {
  const key = document.querySelector('meta[name="posthog-key"]')?.content?.trim();
  const host = document.querySelector('meta[name="posthog-host"]')?.content?.trim() || 'https://us.i.posthog.com';

  window.richoTelemetry = {
    enabled: false,
    capture() {}
  };

  if (!key || key === 'POSTHOG_PROJECT_KEY') return;

  const queue = [];
  const capture = (event, properties = {}) => {
    if (!window.posthog?.capture) {
      queue.push([event, properties]);
      return;
    }
    window.posthog.capture(event, {
      ...properties,
      app: 'richo-product-runtime-hub',
      path: location.pathname
    });
  };

  window.richoTelemetry = { enabled: true, capture };

  const script = document.createElement('script');
  script.async = true;
  script.src = `${host.replace(/\/$/, '')}/static/array.js`;
  script.onload = () => {
    if (!window.posthog?.init) return;
    window.posthog.init(key, {
      api_host: host,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      person_profiles: 'identified_only',
      persistence: 'localStorage+cookie'
    });

    capture('richo_smoke_test', { source: 'runtime_boot' });
    capture('$pageview', { title: document.title });
    while (queue.length) {
      const [event, properties] = queue.shift();
      capture(event, properties);
    }
  };
  document.head.appendChild(script);

  document.addEventListener('click', (event) => {
    const target = event.target.closest('a,button');
    if (!target) return;

    if (target.matches('a[href="#catalog"]')) capture('offer_viewed', { offer: 'catalogue' });
    if (target.matches('[data-score],#catalog-score')) capture('readiness_assessment_started', {
      assessment: target.dataset.score || 'catalogue'
    });
    if (target.matches('a[href*="richosystems.technology"]')) capture('richo_site_opened', {
      destination: target.getAttribute('href')
    });
  }, { passive: true });
})();

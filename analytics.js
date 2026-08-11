(() => {
  const gaId = window.RICHO_GA4_ID;
  if (!gaId) return;

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', gaId, { anonymize_ip: true });

  window.richoTrackEvent = function (event) {
    window.gtag('event', event.type, {
      event_category: event.category || 'engagement',
      event_label: event.label || event.type,
      value: event.value
    });
  };
})();

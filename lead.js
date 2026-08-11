document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('lead-form');
  if (!form) return;

  // Load any saved leads into window for reviewer convenience
  try { window.RICHO_LEADS = JSON.parse(localStorage.getItem('RICHO_LEADS') || '[]'); } catch (e) { window.RICHO_LEADS = []; }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    data.ts = new Date().toISOString();

    // Track local CTA event queue
    window.RICHO_CTA_EVENTS = window.RICHO_CTA_EVENTS || [];
    window.RICHO_CTA_EVENTS.push({type:'lead_submit', data});

    const feedback = document.getElementById('lead-feedback');
    const endpoint = window.RICHO_LEAD_ENDPOINT || null;

    if (endpoint) {
      try {
        await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)});
        if (feedback) feedback.textContent = 'Thanks — lead submitted.';
      } catch (err) {
        if (feedback) feedback.textContent = 'Submission failed: ' + (err.message || err);
      }
      return;
    }

    // No backend configured: store locally and show stub message
    window.RICHO_LEADS = window.RICHO_LEADS || [];
    window.RICHO_LEADS.push(data);
    try { localStorage.setItem('RICHO_LEADS', JSON.stringify(window.RICHO_LEADS)); } catch (e) {}

    if (feedback) feedback.innerHTML = '<strong>Thanks — this demo stores leads locally.</strong> Configure <code>window.RICHO_LEAD_ENDPOINT</code> in the console to post to a real endpoint.';
  });
});

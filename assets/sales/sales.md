Richo Systems — Sales assets

Overview
--------
This folder contains lightweight sales assets for demos, pricing, and pre-sales handoff.

Files
-----
- demo_script.md — 60–90s live demo script
- one_slide_summary.md — one-slide textual summary (TODO: add slide image)
- screenshots/ — optional demo screenshots (place here)

How to run the demo
-------------------
1. Deploy the preview branch to Vercel or Netlify (preview build).
2. Open the staging URL and click "Try demo" on the hero to navigate to the catalogue and run a readiness gate.
3. Use the Contact Sales page to capture leads — the staging endpoint is a stub that logs leads and writes a staging leads.json.

Notes
-----
- Replace the GA4 placeholder (G-XXXXXXX) with the real measurement ID in index.html before production.
- Replace the API stub in api/lead.js with a CRM/email integration in production.

Next steps
----------
- Produce 3 annotated screenshots (hero, catalogue, evidence gate) and add to assets/sales/screenshots/
- Add a single-slide PDF for quick sharing
- Hook the lead endpoint to an email/CRM (SendGrid/SES/HubSpot) and add webhook secrets to the CI environment

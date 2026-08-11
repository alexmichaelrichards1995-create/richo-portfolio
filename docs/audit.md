Richo Systems — 1‑page repo audit

Scope and what was inspected
- Files reviewed: index.html, app.js, catalog.js, README.md, package.json, marketplace_webhook_handler.js, stripe_integration.js, netlify.toml, vercel.json, .github workflows, tests, and the new worktree changes already applied (hero, contact page, api stubs, ai stub, pr-check workflow).

High-level findings (prioritised)
1) Lead capture: contact.html + api/lead.js provide a working staging stub that writes to data/leads.json. Risk: file-backed storage is unsuitable for production. Priority: High — replace with CRM/email webhook or DB-backed store and add rate-limiting & validation.

2) Analytics: GA4 placeholder added to index.html. Action: set real measurement ID and add consent handling. Priority: High.

3) Payments & billing: stripe_integration.js and stripe_connect.js are stubs. Action: implement Stripe Connect flows for payouts and customer billing, secure keys. Priority: High.

4) AI features: provider-agnostic api/ai.js exists (mock/openai). Demo endpoint and UI are needed for sales demos. Action: create server-side demo assistant endpoint, add safety, quotas, and prompt templates. Priority: High (sales value).

5) CI / QA: PR checks workflow added (npm install + tests + smoke). Add automated Lighthouse/perf & accessibility checks to catch regressions early. Priority: Medium.

6) Deployment: Vercel/Netlify/GitHub Pages targets configured. Ensure preview builds expose staging URL for PRs and set environment variables securely. Priority: High for previewability.

7) Performance & accessibility: Images and bundling are simple but unoptimised. Run Lighthouse and fix top 3 regressions: image optimization, caching headers, and JS bundling. Accessibility: add ARIA labels where missing and ensure color contrast. Priority: Medium.

Recommended immediate next steps (first PR scope)
- Deliver a focused PR that:
  1. Adds a demo assistant endpoint (api/demo-assistant.js) wired to api/ai.js (mock by default).
  2. Adds a lightweight demo UI (demo.html) that calls the endpoint and shows canned assistant output.
  3. Finalises GA4 placeholder instructions in README and sales assets (replace G-XXXXXXX).
  4. Ensures contact lead endpoint persists reliably to staging (file stub acceptable), documents CRM webhook replacement in docs.
  5. Adds screenshots and demo script to assets/sales (done).

Acceptance criteria for PR
- PR includes screenshots and demo script (assets/sales).
- Staging preview URL (Vercel/Netlify) available in PR description or CI logs.
- Smoke tests pass (node tests/smoke.mjs).
- Demo UI and demo-assistant endpoint respond in preview and return a mock response when AI_PROVIDER=mock.

Notes & risks
- Do not commit secrets. Use GitHub Actions secrets or provider secret stores for API keys.
- Production AI calls must be server-side with usage limits and sanitisation to reduce cost and data risk.

Planned follow-ups
- Replace file-backed lead storage with CRM/email or DB-backed store.
- Add Lighthouse/perf and automated a11y checks in CI.
- Implement Stripe Connect and a payment flow for on-ramp.
- Harden webhook verification and idempotency for marketplace events.

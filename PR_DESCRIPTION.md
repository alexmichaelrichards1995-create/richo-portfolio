Sale-ready: Hero, Contact, AI demo, sales assets, AI infra, CI & PR checks

Branch: alexmichaelrichards1995-create-automatic-funicular

Summary of changes
- Revamped hero headline and CTAs for sales demos.
- Added Contact Sales page (contact.html) and staging lead endpoint (api/lead.js) that writes to data/leads.json.
- Inserted GA4 snippet placeholder and CTA analytics tracking in app.js.
- Added sales assets (assets/sales/demo_script.md, sales.md) and placeholder demo screenshots in assets/sales/screenshots/.
- Implemented AI infra: api/ai_v2.js (mock/openai), api/demo-assistant.js (rate-limited), demo UI (demo.html), and docs (docs/ai.md).
- Added CI: .github/workflows/pr-checks.yml (tests) and .github/workflows/pr-audit.yml (Lighthouse/pa11y audit on PRs).
- Added docs/audit.md and docs/architecture.md.
- Added tests/demo_assistant.test.js to exercise the demo endpoint.

How to preview
- Vercel/Netlify preview: connect the repo to Vercel/Netlify and open the preview for this branch. Vercel project uses vercel.json functions mapping (nodejs18) for /api endpoints.
- Local preview: start a static server from repo root (e.g. `npx http-server -p 8080`) then open http://127.0.0.1:8080/demo.html to exercise the demo assistant (AI_PROVIDER=mock by default). Run `node tests/smoke.mjs` to run smoke gate.

Acceptance criteria
- Smoke tests pass (node tests/smoke.mjs) on the PR or locally.
- /api/demo-assistant returns a mock response when AI_PROVIDER=mock.
- Contact form posts persist to data/leads.json in staging preview (file-backed stub).
- assets/sales contains demo script and at least 3 screenshots in PR.
- PR audit workflow produces Lighthouse and Pa11y reports attached as artifacts.

Remaining and follow-ups
- staging-deploy-ci: configure Vercel/Netlify project and set secrets (OPENAI_API_KEY, VERCEL_TOKEN, STRIPE keys) for secure preview and production.
- performance/accessibility fixes: fix top Lighthouse regressions (images, caching, bundling) and automated a11y issues.
- Replace file-backed leads with CRM/email integration and secure webhooks for production.

Open PR URL (create this PR):
https://github.com/alexmichaelrichards1995-create/richo-portfolio/pull/new/alexmichaelrichards1995-create-automatic-funicular

Notes
- Do NOT commit secrets. Use GitHub Actions secrets or Vercel/Netlify secret stores.
- To enable OpenAI in staging, set AI_PROVIDER=openai and OPENAI_API_KEY as a secret; monitor usage and costs.

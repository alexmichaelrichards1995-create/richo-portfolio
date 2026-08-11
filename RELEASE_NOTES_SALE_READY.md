Richo Systems — Sale-ready release notes (branch: alexmichaelrichards1995-create-automatic-funicular)

Summary of work delivered
- Revamped hero and CTAs; Contact Sales page and staging lead endpoint with optional CRM forwarding.
- GA4 placeholder + CTA analytics, admin UI (/admin.html) to view leads and AI logs.
- AI infra: api/ai_v3.js with per-request cap and daily token guard; demo assistant (demo.html) with templates; prompt templates included.
- Sales assets: demo script, one-slide HTML/SVG, marketing copy, placeholder screenshots.
- CI & QA: tests, PR checks, Lighthouse/Pa11y PR audit, deploy-preview workflow for Vercel.

How to review
1. Open PR: https://github.com/alexmichaelrichards1995-create/richo-portfolio/pull/new/alexmichaelrichards1995-create-automatic-funicular
2. Use preview deploy (Vercel) when VERCEL_TOKEN set; otherwise run local static server and open demo.html and admin.html.
3. Run smoke tests: node tests/smoke.mjs and npm test (CI runs these).

Merge & production steps (manual)
- Configure secrets: VERCEL_TOKEN, VERCEL_PROJECT_ID, OPENAI_API_KEY, AI_PROVIDER=openai, STRIPE keys, CRM_WEBHOOK_URL, ADMIN_SECRET.
- Replace file-backed lead persistence with DB/CRM webhook-backed store.
- Review PR audit artifacts (Lighthouse/Pa11y) and fix any flagged issues.
- Merge to main and deploy to production with CDN + secure backend for AI and webhooks.

Contact
- For questions or merge approval: contact@richosystems.technology

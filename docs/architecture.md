# Richo Systems — Architecture & Systems Design

Overview
--------
This document describes the components, data flow, CI/CD, AI infra, scaling and security considerations for the R.I.C.H.O. Product Runtime Hub.

Components
----------
- Static frontend: index.html, styles.css, app.js, catalog.js — client-side runtime and scoring.
- API stubs: /api (lead capture, ai-provider) — staging endpoints suitable for preview deployments (Vercel/Netlify functions).
- Marketplace/webhook handlers: server-side Express handlers in marketplace_webhook_handler.js.
- Persistence: lightweight preview uses file-backed store (data/). Production should use a managed DB (Postgres) and object store for artifacts.
- Payments/billing: stripe_integration.js + stripe_connect.js stubs (replace with real Stripe Connect in production).

AI Infrastructure
-----------------
- Provider-agnostic abstraction (api/ai.js). Use environment variable AI_PROVIDER to switch between 'mock' and a real provider (e.g., 'openai').
- For production use: run model calls from a secure server-side environment, implement request quotas, rate-limiting, input/output sanitisation, and cost monitoring.
- Consider hosted model infra (OpenAI, Anthropic) or self-hosted LLMs behind an API gateway for sensitive data.

CI / Preview & Deployment
-------------------------
- PR checks run smoke tests and unit tests (see .github/workflows/pr-checks.yml).
- Preview deployments: use Vercel/Netlify for front-end preview builds; enable environment variables for API keys for preview/staging.
- Production: deploy static assets behind a CDN, API services behind an autoscaling pool with health checks.

Scaling & Monitoring
--------------------
- Monitor lead capture rates, API error rates, AI API usage and costs.
- Add basic observability: request logs, error traces, alerting on error budgets/cost spikes.

Security & Secrets
------------------
- Never commit secrets. Use GitHub Actions secrets or provider secret stores for API keys.
- Validate and verify webhook signatures (marketplace_webhook_handler.js implements HMAC verification).
- Enforce input sanitisation on all server-side endpoints.

Next steps
----------
1. Replace api/lead.js persistence stub with a CRM/email webhook integration for production.
2. Add an authenticated admin UI for lead review and export.
3. Harden AI calls with request quotas, prompt templates, and safety checks.
4. Add automated accessibility and Lighthouse checks to CI and fix top regressions.

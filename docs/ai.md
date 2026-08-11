AI integration and staging notes

Overview
--------
This document describes how to enable and configure AI providers for Richo Systems in staging and production.

Environment variables
---------------------
- AI_PROVIDER: 'mock' (default) or 'openai'
- OPENAI_API_KEY: required when AI_PROVIDER=openai (store securely in CI/deploy secrets)
- AI_MODEL: optional, default is 'gpt-4o'
- AI_RATE_LIMIT_MAX: per-IP request limit window count (default: 30)
- AI_RATE_LIMIT_WINDOW_MS: rate limit window length in ms (default: 60000)

Files
-----
- api/ai_v2.js — improved provider-agnostic caller; logs calls to data/ai_calls.json in staging.
- api/demo-assistant.js — demo endpoint wired to ai_v2 with basic per-IP rate limiting and request logging (data/ai_requests.json).

Security
--------
- Do NOT commit API keys. Use GitHub Actions secrets or your hosting provider's secret manager.
- Limit keys used for preview deployments. Prefer read-only or restricted keys in staging.

Production guidance
-------------------
- Run AI calls server-side in a secure environment; implement strong quotas, auth, and observability.
- Use a managed DB or telemetry store for logs (avoid writing secrets to repo-local files in production).
- Implement prompt templates, content sanitisation, and user consent where required.

OpenAI staging preview — quick guide

Purpose
-------
Enable live OpenAI-based demos in staging with conservative cost controls and a daily token cap.

Environment variables (preview / production)
- AI_PROVIDER=openai
- OPENAI_API_KEY (required)
- AI_MODEL (optional, default: gpt-4o)
- AI_MAX_TOKENS (optional, per-request cap, default: 500)
- AI_DAILY_TOKEN_LIMIT (optional, tokens/day, default: 50000)
- VERCEL_TOKEN (for preview deploys)
- ADMIN_SECRET (optional, for admin endpoints)

Behavior
--------
- api/ai_v3.js enforces AI_MAX_TOKENS and checks a daily token budget before making provider calls.
- Usage and call logs are written to data/ai_usage.json and data/ai_calls.json (staging only). These are not secure stores and should be replaced by a DB/telemetry store in production.

How to enable preview
1. Add OPENAI_API_KEY and set AI_PROVIDER=openai and optionally AI_DAILY_TOKEN_LIMIT/AI_MAX_TOKENS in the Vercel or GitHub Actions environment.
2. Open a PR; the deploy-preview workflow will publish a preview if VERCEL_TOKEN, VERCEL_PROJECT_ID and VERCEL_ORG_ID are configured.
3. Visit demo.html on the preview and run the assistant. The admin UI (/admin.html) can show usage logs if ADMIN_SECRET is set.

Safety notes
- Monitor usage and costs closely after enabling; the token estimator is conservative but approximate.
- Never commit secrets. Use provider secret stores and rotate keys if leaked.

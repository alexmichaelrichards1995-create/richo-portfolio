Deploying previews and production — Richo Systems

Required secrets (set in Vercel/GitHub Actions/Netlify):
- VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID (for Vercel action)
- OPENAI_API_KEY (if enabling AI_PROVIDER=openai)
- STRIPE_SECRET / STRIPE_CONNECT_CLIENT_ID (for payments/payouts)
- CRM_WEBHOOK_URL (optional; endpoint to forward leads)

Preview steps
1. Connect repository to Vercel and enable Preview Deployments.
2. Add VERCEL_TOKEN and project/org IDs to GitHub secrets (or use Vercel GitHub integration).
3. Open a Pull Request on the branch and observe the deploy-preview workflow; if VERCEL_TOKEN set the site will be published.

Enabling AI in staging
- Add OPENAI_API_KEY to secrets and set AI_PROVIDER=openai in the preview environment.
- Monitor usage and costs closely; consider restricted keys for preview.

CRM / Lead handling
- Set CRM_WEBHOOK_URL to a secure endpoint that receives the lead JSON.
- The staging stub persists to data/leads.json; in production replace with a DB-backed store or CRM integration.

Notes
- Do not commit secrets; use the hosting provider's secret manager.
- After deployment, run the PR audit job and review Lighthouse/Pa11y artifacts; fix top issues as needed.
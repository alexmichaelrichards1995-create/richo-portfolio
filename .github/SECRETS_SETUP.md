Repository CI secrets and branch protection setup

This document shows example commands (gh CLI) to configure repository secrets and enable branch protection for the main branch. Run these as a repo admin with gh authenticated.

1) Add repository secrets (replace values):

# Set webhook secret used by GitHub Marketplace CI tests and local runs
gh secret set GITHUB_WEBHOOK_SECRET --body "$(echo -n 'your-webhook-secret')"

# Set Stripe API key (prefer the minimum-permission restricted key appropriate to the runtime)
gh secret set STRIPE_API_KEY --body "$(echo -n 'rk_test_...')"

# Stripe endpoint signing secret for the verified revenue webhook.
# Never commit the real whsec_ value to source control.
gh secret set STRIPE_WEBHOOK_SECRET --body "$(echo -n 'whsec_...')"

# PostHog project token used by the public event-ingestion API.
# Keep it in runtime configuration even though project tokens are not personal API keys.
gh secret set POSTHOG_PROJECT_TOKEN --body "$(echo -n 'phc_...')"

# PayCore database connection used only by server-side runtime and activation evidence.
gh secret set DATABASE_URL --body "$(echo -n 'postgres://...')"

# Dedicated bearer token for the protected PayCore -> PostHog revenue sync endpoint.
gh secret set REVENUE_SYNC_TOKEN --body "$(openssl rand -hex 32)"

Optional repository variable for the activation-evidence workflow:

gh variable set PAYCORE_BASE_URL --body "https://richo-paycore-intake-api.vercel.app"

If PAYCORE_BASE_URL is omitted, the source-controlled evidence runner uses the same authoritative PayCore URL by default.

2) Production runtime configuration

Configure DATABASE_URL, STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET, POSTHOG_PROJECT_TOKEN, POSTHOG_HOST and REVENUE_SYNC_TOKEN in the actual backend deployment environment. The verified purchase handler intentionally refuses production persistence when DATABASE_URL is missing. The revenue-sync endpoint remains disabled when REVENUE_SYNC_TOKEN is absent.

Recommended POSTHOG_HOST for this project: https://us.i.posthog.com

3) Activation evidence

The manual GitHub workflow `PayCore Activation Evidence` is read-only with respect to payment state. It checks the deployed health/readiness routes, confirms the webhook is POST-only, validates the PayCore database schema, and records payment/webhook/analytics counts in an uploaded JSON artifact. It does not create a checkout, send a Stripe webhook, move funds, fulfil a product or mutate payment state.

The workflow uses the canonical secrets DATABASE_URL, STRIPE_WEBHOOK_SECRET, POSTHOG_PROJECT_TOKEN and REVENUE_SYNC_TOKEN. It reports only configuration-presence booleans and database evidence; it must never print secret values.

Current production cutover rule: the retained v2.0 PayCore deployment returns 404 for `/api/ready`. Do not treat that deployment as activation-ready. The hardened source-controlled release must return 200 from `/api/ready`, verify the expected PayCore schema, and pass the activation evidence gate before any signed Stripe test is run.

4) Enable branch protection for 'main' to require CI:

# Require GitHub Actions to pass before merging
gh api repos/:owner/:repo/branches/main/protection --method PUT -f required_status_checks='{"strict":true,"contexts":["CI"]}' -f enforce_admins=true -f required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false}' -f restrictions='null'

Notes:
- The gh api command above uses :owner and :repo placeholders — replace with your repo owner and name or run from within a checked-out repo to use implicit context.
- Alternatively, use the GitHub UI: Settings → Branches → Add rule → select 'Require status checks to pass' and add 'CI'.
- Stripe webhook signature verification must remain enabled. Do not process revenue from unsigned requests.
- Never log Stripe keys, webhook secrets, database URLs, revenue-sync tokens, or full environment variables.

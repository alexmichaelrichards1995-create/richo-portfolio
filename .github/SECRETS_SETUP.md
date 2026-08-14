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

2) Production runtime configuration

Configure DATABASE_URL, STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET, POSTHOG_PROJECT_TOKEN and POSTHOG_HOST in the actual backend deployment environment. The verified purchase handler intentionally refuses production persistence when DATABASE_URL is missing.

Recommended POSTHOG_HOST for this project: https://us.i.posthog.com

3) Enable branch protection for 'main' to require CI:

# Require GitHub Actions to pass before merging
gh api repos/:owner/:repo/branches/main/protection --method PUT -f required_status_checks='{"strict":true,"contexts":["CI"]}' -f enforce_admins=true -f required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false}' -f restrictions='null'

Notes:
- The gh api command above uses :owner and :repo placeholders — replace with your repo owner and name or run from within a checked-out repo to use implicit context.
- Alternatively, use the GitHub UI: Settings → Branches → Add rule → select 'Require status checks to pass' and add 'CI'.
- Stripe webhook signature verification must remain enabled. Do not process revenue from unsigned requests.
- Never log Stripe keys, webhook secrets, or full environment variables.

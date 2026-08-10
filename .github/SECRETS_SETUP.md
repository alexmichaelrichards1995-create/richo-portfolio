Repository CI secrets and branch protection setup

This document shows example commands (gh CLI) to configure repository secrets and enable branch protection for the main branch. Run these as a repo admin with gh authenticated.

1) Add repository secrets (replace values):

# Set webhook secret used by CI tests and local runs
gh secret set GITHUB_WEBHOOK_SECRET --body "$(echo -n 'your-webhook-secret')"

# Set Stripe API key (live/test as appropriate)
gh secret set STRIPE_API_KEY --body "$(echo -n 'sk_test_...')"

2) Optional: add additional secrets for production (DATABASE_URL, SENTRY_DSN, etc.)

3) Enable branch protection for 'main' to require CI:

# Require GitHub Actions to pass before merging
gh api repos/:owner/:repo/branches/main/protection --method PUT -f required_status_checks='{"strict":true,"contexts":["CI"]}' -f enforce_admins=true -f required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false}' -f restrictions='null'

Notes:
- The gh api command above uses :owner and :repo placeholders — replace with your repo owner and name or run from within a checked-out repo to use implicit context.
- Alternatively, use the GitHub UI: Settings → Branches → Add rule → select 'Require status checks to pass' and add 'CI'.

If you'd like, run these commands and I can verify CI passes on the branch and then enable protection via the API (requires admin auth).
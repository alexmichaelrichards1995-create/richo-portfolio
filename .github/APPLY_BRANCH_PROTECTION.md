Apply branch protection (admin)

Use the Branch Protection API to apply the payload in .github/branch_protection_payload.json to the main branch.

Run as a repo admin with gh authenticated:

gh api --method PUT /repos/:owner/:repo/branches/main/protection --input .github/branch_protection_payload.json

Replace :owner/:repo if running outside the cloned repo.

Payload details:
- Require status checks: CI (strict)
- Enforce for admins
- Require pull request reviews with stale dismissal
- No restrictions (allow collaborators to push if allowed by other rules)

After applying, verify at: https://github.com/:owner/:repo/settings/branches

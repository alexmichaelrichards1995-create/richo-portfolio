# Automation

## Workflows

- `ci-cd-main.yml` — validation, matrix smoke testing, security checks, Docker packaging, staging deploy, Pages deploy and Slack notification.
- `scheduled-maintenance.yml` — weekly/monthly dependency maintenance, Lighthouse CI, SonarCloud and backup archive generation.
- `security-audit.yml` — npm audit, Trivy, TruffleHog, ShiftLeft and Semgrep scans.
- `release.yml` — changelog generation, release creation and archive publishing.

## Shared automation

- `.github/actions/runtime-validation/action.yml` provides shared Node setup and validation steps.
- `.pre-commit-config.yaml` and `.githooks/pre-commit` run local smoke and automation checks before commit.
- `.github/dependabot.yml` schedules GitHub Actions and Docker dependency updates.

## Secrets expected by workflows

- `SLACK_WEBHOOK_URL`
- `STAGING_DEPLOY_HOOK`
- `STAGING_HEALTHCHECK_URL`
- `PRODUCTION_HEALTHCHECK_URL`
- `SONAR_TOKEN`
- `SHIFTLEFT_ACCESS_TOKEN`

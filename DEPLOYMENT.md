# Deployment

## Supported targets

- GitHub Pages for the primary static runtime deployment
- Docker/Nginx via `Dockerfile`
- Netlify via `netlify.toml`
- Vercel via `vercel.json`

## CI/CD deployment flow

1. Validate runtime files and automation structure
2. Run smoke tests across Node.js 16, 18 and 20
3. Perform dependency and source security scans
4. Build static artifacts and a Docker image
5. Trigger staging deployment hook and health check
6. Deploy production to GitHub Pages and run the production health check

## Optional secrets

- `STAGING_DEPLOY_HOOK`
- `STAGING_HEALTHCHECK_URL`
- `PRODUCTION_HEALTHCHECK_URL`
- `SLACK_WEBHOOK_URL`

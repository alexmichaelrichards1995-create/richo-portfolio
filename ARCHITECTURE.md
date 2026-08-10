# Architecture

## Runtime layers

1. Static presentation layer (`index.html`, `styles.css`)
2. Catalogue and readiness logic (`catalog.js`, `app.js`)
3. Verification and automation layer (`tests/`, `.github/workflows/`)
4. Deployment surface (GitHub Pages, Docker, Netlify, Vercel)

## Component interactions

- `catalog.js` exposes the canonical product registry.
- `app.js` renders catalogue search, product selection and readiness scoring.
- `tests/smoke.mjs` protects the runtime surface.
- `tests/automation.mjs` protects the automation, documentation and showcase structure.
- GitHub Actions orchestrate validation, security scanning, packaging, release and maintenance flows.

## Operations model

- Validation runs before build and deployment.
- Security scanning is layered across dependencies, source, container and secret detection.
- Staging and production deployments are isolated with separate concurrency groups and health checks.

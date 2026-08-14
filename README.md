# R.I.C.H.O. Product Runtime Hub

![CI](https://github.com/alexmichaelrichards1995-create/richo-portfolio/actions/workflows/ci.yml/badge.svg)

A controlled browser-based runtime layer for the R.I.C.H.O. (Research Intelligence & Continuous Heuristic Optimisation) digital product catalogue.

## Current runtime

- 53 addressable products: `RSP-001` through `RSP-053`
- 6 product-family readiness engines
- 3 specialised interactive engines for:
  - RSP-001 — AI Governance Starter Kit
  - RSP-002 — Paid Pilot Readiness Kit
  - RSP-003 — Buyer-Ready IP and Due-Diligence Kit
- deterministic client-side scoring
- evidence-gap reporting
- explicit human approval gates
- no secrets or backend dependency for readiness assessments
- automated smoke tests before deployment packaging

## Product families

1. Foundation
2. Governance, Risk & Assurance
3. Commercial & Revenue
4. Product & Delivery
5. Procurement, Market Access & Transactions
6. Leadership, Workforce & Operating System

## Safety and authority boundary

The runtime is an implementation/readiness aid. A readiness score does not provide professional advice, certification, legal compliance, financial approval, security assurance, contractual acceptance or authority to perform consequential external actions. Human approval remains required where applicable.

## Local verification

```bash
node tests/smoke.mjs
```

The smoke gate checks required runtime files, removes known scaffold placeholders, verifies the complete unique RSP-001–RSP-053 catalogue and confirms the core runtime functions are present.

## Local preview

### Docker

```bash
docker build -t richo-runtime .
docker run --rm -p 8080:80 richo-runtime
```

Open `http://localhost:8080`.

You can also serve the repository root with any static HTTP server.

## Deployment targets

Configuration is retained for GitHub Pages, Vercel, Netlify and Docker/Nginx.

The GitHub Actions workflow runs the smoke gate, packages the static site and attempts a Pages deployment from `main`. GitHub Pages must be enabled in repository settings before the final Pages deployment step can succeed.

## Production domain

Primary Richo Systems domain: `https://richosystems.technology/`

The runtime also links to the Richo Systems tools surface at `/tools`.

## Repository structure

- `index.html` — runtime UI and product surfaces
- `catalog.js` — canonical RSP-001–RSP-053 runtime catalogue
- `app.js` — scoring, search, selection and readiness engines
- `styles.css` — responsive runtime interface
- `tests/smoke.mjs` — pre-deployment verification
- `.github/workflows/deploy-pages.yml` — CI/deployment workflow
- `Dockerfile`, `vercel.json`, `netlify.toml` — alternate deployment targets

## Payment integration development

Airwallex sandbox development is isolated in draft PR #16 pending provider onboarding and end-to-end sandbox verification.

## Completion standard

A product should not be described as fully production-ready merely because it appears in the catalogue. The shared runtime currently gives all 53 products an executable readiness/control layer. Full product-specific software conversion requires each product to receive its own workflow logic, input/output model, persistence/export requirements where appropriate, acceptance tests, documentation and deployment verification.

# PayCore Reconstruction Deployment Manifest

Status: PREVIEW-ONLY / SANDBOX-ONLY

## Source of truth

- Repository: `alexmichaelrichards1995-create/richo-portfolio`
- Branch: `richo-systems-upgrade-2026-08-17`
- Root directory: `paycore-reconstruction/`
- Production PayCore project must NOT be used as the first deployment target.

## Required Vercel project

Create or bind a dedicated project named `richo-paycore-reconstruction-preview` (or another clearly preview-only name) with:

- Framework: Next.js
- Root Directory: `paycore-reconstruction`
- Production branch: none / do not promote during reconstruction
- Preview deployments enabled
- Node.js: 24.x

## Mandatory environment safety

Preview environment only:

- `PAYMENT_MODE=sandbox`
- `LIVE_MONEY=false`
- `CHECKOUT_ENABLED=false`
- `DATABASE_URL=<preview/test database only>`

Do not copy production Stripe live keys into this project. Do not point the reconstruction at a production-write database.

## Promotion gates

A preview may only be considered for later promotion after all of the following are true:

1. GitHub CI is green for the exact commit being deployed.
2. `/api/health` returns 200 and `liveMoney=false`.
3. `/api/ready` returns 200 and reports the preview database reachable.
4. `/api/offers` matches the captured production contract for SKU, name, AUD currency and amount.
5. `npm run test:paycore-contract` passes with `PAYCORE_BASE_URL` set to the preview URL.
6. Checkout remains blocked during reconstruction validation.
7. Runtime errors are zero or explicitly reviewed.
8. The preview deployment can be traced to the exact Git commit SHA.
9. Rollback target and existing production deployment IDs are recorded before any production promotion.

## Current production boundary

Existing production `richo-paycore-intake-api` remains untouched until the preview passes every gate above.

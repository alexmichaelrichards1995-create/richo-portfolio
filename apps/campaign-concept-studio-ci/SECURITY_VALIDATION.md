# Campaign Concept Studio — Security and CI Validation

Validated on the isolated `campaign-concept-studio-mixpanel` branch.

## Release gates

- Source archive integrity is pinned by byte count and SHA-256 before extraction.
- Node.js 24 is used for CI validation.
- Dependencies are installed from the public npm registry in GitHub Actions.
- `npm audit --audit-level=high` is a blocking gate.
- Mixpanel architecture/privacy validation must pass.
- TypeScript `tsc --noEmit` must pass.
- Optimized Next.js production build must pass.

## Security remediation

- Next.js upgraded from `16.2.12` to `16.3.1` after the dependency audit identified high-severity advisories in transitive PostCSS/Sharp paths.
- The upgraded build passed the blocking high-severity audit.

## Analytics boundary

- Primary value event: `campaign_generated`.
- Analytics remains consent-gated.
- Autocapture and Session Replay remain disabled.
- Campaign brief/audience/product free text, generated copy, image prompts, image payloads, raw upstream errors, and OpenAI credentials are not permitted Mixpanel event properties.

## Verified CI result

The hardened CI run passed archive integrity, dependency installation, blocking high-severity audit, Mixpanel architecture/privacy validation, TypeScript checking, and optimized production build.

## Production status

Validated and review-ready. This record does not authorize merging or production deployment by itself.

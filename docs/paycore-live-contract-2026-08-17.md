# PayCore live production contract snapshot

Captured: 2026-08-17 AEST
Source: `https://richo-paycore-intake-api.vercel.app`
Deployment: `dpl_ABpFzThE71rHYVpjmh82JyWuxLYc`

## Provenance

The current production deployment was built from 10 uploaded deployment files via Vercel CLI. Build logs do not expose a Git branch or commit SHA. Treat this service as direct-upload / provenance-unverified until source control linkage is established.

## GET /api/health

Expected HTTP status: `200`

```json
{
  "service": "richo-paycore",
  "version": "3.0.0",
  "deployment": "production",
  "paymentMode": "sandbox",
  "status": "configured",
  "codeReady": true,
  "databaseConfigured": true,
  "webhookConfigured": true,
  "paymentLinksConfigured": true,
  "gstRegistered": false,
  "liveMoney": false
}
```

Required response properties:
- `service === "richo-paycore"`
- `version === "3.0.0"`
- `deployment === "production"`
- `paymentMode === "sandbox"`
- `codeReady === true`
- `databaseConfigured === true`
- `webhookConfigured === true`
- `paymentLinksConfigured === true`
- `liveMoney === false`

## GET /api/ready

Expected HTTP status: `200`

```json
{
  "status": "ready",
  "deployment": "production",
  "paymentMode": "sandbox",
  "liveMoney": false,
  "database": "reachable",
  "schema": "paycore-v3",
  "checkout": "configured",
  "webhook": "configured",
  "sandboxRevenueExcluded": true
}
```

Required response properties:
- `status === "ready"`
- `database === "reachable"`
- `schema === "paycore-v3"`
- `checkout === "configured"`
- `webhook === "configured"`
- `paymentMode === "sandbox"`
- `liveMoney === false`
- `sandboxRevenueExcluded === true`

## GET /api/offers

Expected HTTP status: `200`
Expected currency: `AUD`
Expected payment mode: `sandbox`

Canonical offer contract captured from production:

| slug | SKU | name | amountMinor | currency |
|---|---|---|---:|---|
| `quick-wins-kit` | `RSP-056` | R.I.C.H.O. AI Business Quick-Wins Kit | 1900 | AUD |
| `ai-quick-fix` | `RICHO-AQF-COURSE` | AI Quick Fix for Small Business | 4900 | AUD |
| `ai-quick-fix-session` | `RICHO-AQF-SESSION` | AI Quick Fix Session | 19700 | AUD |

## Promotion rule

A reconstructed or Git-backed PayCore preview must match this contract before any production traffic switch. Additional fields are allowed if backwards compatible. Removing or renaming required fields, changing sandbox/live-money semantics, changing offer identity or prices, or making database readiness weaker requires an explicit owner-approved migration.

## Current safety state

The live production service reports `paymentMode: sandbox` and `liveMoney: false`. Do not treat sandbox checkout activity as production revenue.

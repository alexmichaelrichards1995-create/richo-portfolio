# Payment Provider Readiness Evidence Template

Use one copy per provider. Do not mark a provider live from marketing emails or account existence alone.

## Provider

- Name:
- Environment: sandbox / live
- Account verification: UNKNOWN / PENDING / APPROVED / RESTRICTED
- Payout/settlement: UNKNOWN / PENDING / CONFIRMED / RESTRICTED
- Credential location: secret-store reference only
- Webhook endpoint:
- Webhook signature validation: PASS / FAIL / NOT TESTED
- Duplicate event test: PASS / FAIL / NOT TESTED
- Fixed A$199 offer test: PASS / FAIL / NOT TESTED
- Failure-path test: PASS / FAIL / NOT TESTED
- Fulfilment callback: PASS / FAIL / NOT TESTED
- Owner emergency-disable: PASS / FAIL / NOT TESTED
- First supervised live transaction: PASS / FAIL / NOT RUN
- Final status: COMPLETED / VERIFIED_LIVE / BLOCKED_BY_PROVIDER / OWNER_INPUT_REQUIRED / TECHNICAL_BLOCKER

## Evidence

Record provider dashboard receipts, event IDs, timestamps, deployment IDs, webhook delivery IDs, sanitized logs, and reconciliation evidence. Never paste secret values.

# Payment Provider Live Approval Policy

Owner approval to finish the rollout is recorded, but provider state must still be evidence-gated.

A provider can only be promoted from BLOCKED/UNKNOWN to VERIFIED_LIVE when all release evidence exists. Internal owner approval removes R.I.C.H.O. workflow holds; it cannot substitute for third-party merchant verification, payout enablement, underwriting, legal acceptance, or successful production transaction evidence.

## Promotion sequence

`UNKNOWN -> SANDBOX_READY -> SANDBOX_VERIFIED -> PROVIDER_APPROVED -> PRODUCTION_CONFIGURED -> SUPERVISED_LIVE_PASS -> VERIFIED_LIVE`

Any failed signature check, payout restriction, settlement restriction, production error, duplicate fulfilment, or unresolved compliance requirement demotes the provider to BLOCKED until repaired and retested.

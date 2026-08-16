# Payment Provider Readiness State

This file is intentionally conservative. It records only evidence currently available through connected systems.

| Provider | State | Evidence gap |
|---|---|---|
| Stripe | BLOCKED_BY_PROVIDER / OWNER_INPUT_REQUIRED | Business verification and payout status need explicit confirmation; production webhook and supervised live transaction not evidenced here |
| Square | TECHNICAL_BLOCKER | Developer/API app, signed webhook and A$199 sandbox flow not yet evidenced |
| GoCardless | TECHNICAL_BLOCKER | Sandbox account/mandate flow/webhook test not yet evidenced |
| Airwallex | BLOCKED_BY_PROVIDER | Ticket #1598672 awaiting provider response / onboarding requirements |
| PayPal | TECHNICAL_BLOCKER | Sandbox REST app and webhook verification not yet evidenced |
| Eway | TECHNICAL_BLOCKER | Sandbox merchant/API flow not yet evidenced |

No provider is promoted to `VERIFIED_LIVE` by this file alone.

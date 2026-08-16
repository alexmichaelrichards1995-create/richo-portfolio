# Payment Provider Blocker Register

| Provider | Current blocker class | Removal rule |
|---|---|---|
| Stripe | Provider / owner verification evidence | Confirm business verification, payouts, production webhook, E2E test and first supervised live transaction |
| Square | Technical + provider onboarding | Developer app, sandbox location, signed webhook, A$199 sandbox flow, payout verification |
| GoCardless | Technical onboarding | Sandbox account, mandate flow, webhook signature test, then live verification |
| Airwallex | Provider support | Ticket #1598672 response, required business onboarding, demo/API credentials, payment-link test |
| PayPal | Technical onboarding | Business account verification, sandbox REST app, Orders v2 flow, webhook verification |
| Eway | Technical onboarding | Merchant/sandbox account, Rapid API credentials, Responsive Shared Page result verification |

## Global blockers

- Production database SSL mode must be explicitly certificate-verifying.
- Missing evidence must remain UNKNOWN/BLOCKED.
- No provider may bypass KYC/KYB or settlement controls.
- No A$48,000 automatic debit is permitted.

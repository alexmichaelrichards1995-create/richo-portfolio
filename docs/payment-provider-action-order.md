# Immediate Action Order

1. Fix and verify production PostgreSQL TLS configuration.
2. Confirm Stripe business verification and payout/settlement status.
3. Finish Square sandbox API + signed webhook + A$199 checkout.
4. Finish GoCardless sandbox mandate + signed webhook.
5. Complete Airwallex onboarding after ticket #1598672 response.
6. Configure PayPal sandbox Orders v2 + webhook verification.
7. Configure Eway sandbox Responsive Shared Page + result verification.
8. Run normalized fulfilment duplicate/retry tests across all enabled providers.
9. Supervise the first production transaction per provider before `VERIFIED_LIVE`.

Do not remove provider/compliance blockers by relabelling them. Remove them only by satisfying and recording their evidence gate.

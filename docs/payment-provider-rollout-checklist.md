# Payment Provider Rollout Checklist

## Technical completion

- [ ] Production database TLS warning removed and verified.
- [ ] Provider dashboard shows merchant/business verification status.
- [ ] Settlement/payout destination confirmed.
- [ ] Sandbox credentials stored only in secret manager.
- [ ] Production credentials stored only in secret manager.
- [ ] Provider webhook endpoint registered.
- [ ] Provider webhook signature validation passes.
- [ ] Duplicate webhook delivery is suppressed.
- [ ] A$199 fixed-price checkout passes in sandbox.
- [ ] Failed/abandoned payment path is handled safely.
- [ ] Normalized fulfilment event reaches downstream workflow once.
- [ ] Owner emergency-disable tested.
- [ ] First live transaction is supervised and reconciled.

## Provider order

1. Stripe
2. Square
3. GoCardless
4. Airwallex
5. PayPal
6. Eway

The A$48,000 offer stays human-reviewed and non-automatic throughout this rollout.

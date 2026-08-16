# Payment Provider Release Gates

Every provider must pass all gates before live promotion:

- G1 merchant verification approved
- G2 payout/settlement confirmed
- G3 sandbox credentials configured securely
- G4 production credentials configured securely
- G5 webhook registered
- G6 signature verification PASS
- G7 duplicate suppression PASS
- G8 A$199 sandbox checkout PASS
- G9 failure/abandonment handling PASS
- G10 normalized fulfilment once-only PASS
- G11 emergency-disable PASS
- G12 production health PASS
- G13 first supervised live transaction reconciled

Any failed gate blocks `VERIFIED_LIVE`.

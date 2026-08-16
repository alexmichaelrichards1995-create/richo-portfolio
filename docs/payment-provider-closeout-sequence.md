# Closeout Sequence

For each provider: satisfy external verification -> configure sandbox -> verify signed webhook -> verify duplicate suppression -> run A$199 sandbox transaction -> verify downstream fulfilment -> configure production secrets/webhook -> production health check -> supervised live transaction -> reconcile payout/settlement -> mark VERIFIED_LIVE.

If any step fails, roll back to the last verified state and keep the provider disabled for customer routing.

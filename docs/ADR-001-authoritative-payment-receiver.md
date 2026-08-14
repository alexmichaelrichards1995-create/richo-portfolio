# ADR-001 — Authoritative Payment Receiver and Revenue Truth

**Status:** Accepted for implementation; production activation pending environment readiness.

## Context

R.I.C.H.O. currently has two payment-related implementation paths:

1. an existing `richo-paycore-intake-api` service with checkout, webhook, idempotency, payment-intent, ledger, refund, dispute and reconciliation storage; and
2. this repository's verified Stripe purchase + PostHog instrumentation path.

Running both as independent purchase receivers would create split-brain revenue state, duplicate webhook processing, inconsistent fulfilment decisions and ambiguous audit evidence.

## Decision

`richo-paycore-intake-api` and its `richo-paycore-live` PostgreSQL database are the authoritative payment and commercial transaction system of record once production activation is complete.

This repository's revenue instrumentation must consume or mirror **verified PayCore success state** rather than create an independent commercial truth source for the same checkout flow.

### Authority boundaries

- Stripe is the external payment-provider event source.
- PayCore is the authoritative internal payment receiver and durable transaction ledger.
- PostgreSQL PayCore records are the internal source of truth for payment state, product/SKU, amount, GST, currency, provider identifiers, fulfilment and audit/reconciliation evidence.
- PostHog is analytics/measurement only. A PostHog event never authorizes fulfilment, refund, pricing, access entitlement, accounting recognition or fund movement.
- `richo_checkout_started` is intent only and never revenue.
- `richo_purchase_completed` may be emitted only after PayCore has durably accepted a provider-verified successful payment.

## Exactly-once boundary

PayCore webhook receipts use provider + provider event ID as the durable webhook idempotency boundary. Analytics deduplication is secondary defense only and must never replace payment-ledger idempotency.

A repeated Stripe event must resolve to the existing PayCore receipt/payment state and must not create another sale, another fulfilment action or another revenue record.

## Production topology

Target flow:

`buyer checkout → Stripe → public PayCore webhook → signature verification → webhook receipt → payment intent/ledger update → verified success → analytics outbox/capture → PostHog`

Only one Stripe webhook endpoint should be registered as the authoritative purchase receiver for this flow.

## Activation gates

Production is blocked until all of the following are verified:

1. PayCore production database connection is configured and reachable from Vercel.
2. A Stripe webhook signing secret is installed in the same production deployment that receives the webhook.
3. The selected webhook URL is publicly reachable by Stripe and is not gated by interactive deployment authentication.
4. Stripe has exactly one authoritative endpoint configured for the selected purchase-success events.
5. A signed test event is received and durably recorded.
6. A duplicate delivery is proven idempotent.
7. Verified payment state can emit `richo_purchase_completed` without exposing sensitive payment/customer data.
8. Checkout, webhook, database and analytics health evidence is retained for audit.

## Non-goals

This ADR does not authorize live charges, price changes, refunds, customer outreach, production secret disclosure or bypass of repository/deployment protection rules.

## Migration direction for this PR

The Stripe normalization, paid-only qualification, stable analytics identifiers and PostHog capture logic in this PR remain useful. Before production activation, they should be integrated behind PayCore's successful-payment boundary or adapted to consume PayCore's durable event/outbox state. The standalone `/api/stripe` receiver must not be activated alongside PayCore for the same commercial flow.

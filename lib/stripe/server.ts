import 'server-only'

import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe() {
  const key = process.env.STRIPE_RESTRICTED_KEY

  if (!key) {
    throw new Error('STRIPE_RESTRICTED_KEY is not configured')
  }

  if (!stripeClient) {
    // stripe-node v22.5.0 pins the compatible Stripe API version. Do not
    // override apiVersion independently from the SDK types.
    stripeClient = new Stripe(key, {
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: {
        name: 'R.I.C.H.O. Systems',
        version: '0.1.0',
      },
    })
  }

  return stripeClient
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  return secret
}

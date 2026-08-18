import 'server-only'

import Stripe from 'stripe'

export type StripeMode = 'test' | 'live'

let stripeClient: Stripe | null = null
let stripeClientMode: StripeMode | null = null

function configuredStripeMode(): StripeMode {
  const mode = (process.env.STRIPE_MODE || 'test').trim().toLowerCase()
  if (mode !== 'test' && mode !== 'live') {
    throw new Error('STRIPE_MODE must be either test or live')
  }
  return mode
}

function stripeKeyMode(key: string): StripeMode | null {
  if (/^(?:rk|sk)_test_/.test(key)) return 'test'
  if (/^(?:rk|sk)_live_/.test(key)) return 'live'
  return null
}

function assertStripeKeyMode(key: string) {
  const configured = configuredStripeMode()
  const detected = stripeKeyMode(key)

  if (!detected) {
    throw new Error('Stripe key mode could not be verified from the key prefix')
  }

  if (detected !== configured) {
    throw new Error(`Stripe key mode mismatch: configured ${configured}, key is ${detected}`)
  }

  if (configured === 'live' && process.env.RICHO_LIVE_PAYMENTS_ENABLED !== 'true') {
    throw new Error('Live Stripe operations are disabled by the R.I.C.H.O. live-money gate')
  }

  return configured
}

export function getStripeMode() {
  return configuredStripeMode()
}

export function getStripe() {
  const key = process.env.STRIPE_RESTRICTED_KEY

  if (!key) {
    throw new Error('STRIPE_RESTRICTED_KEY is not configured')
  }

  const mode = assertStripeKeyMode(key)

  if (!stripeClient || stripeClientMode !== mode) {
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
    stripeClientMode = mode
  }

  return stripeClient
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  return secret
}

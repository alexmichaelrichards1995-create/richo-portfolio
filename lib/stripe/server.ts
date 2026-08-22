import 'server-only'

import Stripe from 'stripe'

export type StripeMode = 'test' | 'live'

type StripeTransportConfig = {
  transportId: string
  host?: string
  port?: number
  protocol?: 'http' | 'https'
  telemetry?: boolean
  maxNetworkRetries: number
  timeout: number
}

let stripeClient: Stripe | null = null
let stripeClientMode: StripeMode | null = null
let stripeClientTransport: string | null = null

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

function stripeTransport(mode: StripeMode): StripeTransportConfig {
  const useMock = process.env.STRIPE_TEST_MOCK_ENABLED === 'true'

  if (!useMock) {
    return {
      transportId: 'stripe-api',
      maxNetworkRetries: 2,
      timeout: 20_000,
    }
  }

  if (mode !== 'test') {
    throw new Error('Stripe mock transport is only permitted in test mode')
  }

  const port = Number(process.env.STRIPE_TEST_MOCK_PORT || '12111')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('STRIPE_TEST_MOCK_PORT is invalid')
  }

  const host = (process.env.STRIPE_TEST_MOCK_HOST || '127.0.0.1').trim()
  if (!host || host === 'api.stripe.com') {
    throw new Error('Stripe mock host must be a dedicated non-production endpoint')
  }

  return {
    transportId: `mock:${host}:${port}`,
    host,
    port,
    protocol: 'http',
    telemetry: false,
    maxNetworkRetries: 0,
    timeout: 5_000,
  }
}

function mockAuthorizationKey() {
  // stripe-mock validates Authorization key shape. Assemble a deterministic
  // test-only value at runtime so no key-shaped credential is committed.
  return ['sk', 'test', '123456789012345678901234'].join('_')
}

export function getStripeMode() {
  return configuredStripeMode()
}

export function getStripe() {
  const configuredKey = process.env.STRIPE_RESTRICTED_KEY

  if (!configuredKey) {
    throw new Error('STRIPE_RESTRICTED_KEY is not configured')
  }

  const mode = assertStripeKeyMode(configuredKey)
  const transport = stripeTransport(mode)
  const { transportId, ...transportConfig } = transport
  const clientKey = transportId.startsWith('mock:') ? mockAuthorizationKey() : configuredKey

  if (!stripeClient || stripeClientMode !== mode || stripeClientTransport !== transportId) {
    // stripe-node v22.5.0 pins the compatible Stripe API version. Do not
    // override apiVersion independently from the SDK types.
    stripeClient = new Stripe(clientKey, {
      ...transportConfig,
      appInfo: {
        name: 'R.I.C.H.O. Systems',
        version: '0.1.0',
      },
    })
    stripeClientMode = mode
    stripeClientTransport = transportId
  }

  return stripeClient
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  return secret
}

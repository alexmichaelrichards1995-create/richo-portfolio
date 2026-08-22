export type RichoDeliveryMode =
  | 'download'
  | 'account_access'
  | 'subscription_access'
  | 'service_delivery'

export type RichoEntitlementType =
  | 'download'
  | 'software_access'
  | 'subscription_access'
  | 'service_access'

export type RichoSubscriptionStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'cancelled'
  | 'expired'

export function entitlementTypeForDeliveryMode(mode: string): RichoEntitlementType {
  switch (mode as RichoDeliveryMode) {
    case 'download':
      return 'download'
    case 'account_access':
      return 'software_access'
    case 'subscription_access':
      return 'subscription_access'
    case 'service_delivery':
      return 'service_access'
    default:
      throw new Error(`Unsupported delivery mode: ${mode}`)
  }
}

export function normalizeStripeSubscriptionStatus(status: string): RichoSubscriptionStatus {
  switch (status) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'paused':
    case 'incomplete':
      return status
    case 'canceled':
      return 'cancelled'
    case 'incomplete_expired':
      return 'expired'
    case 'unpaid':
      return 'past_due'
    default:
      return 'incomplete'
  }
}

export function unixSecondsToIso(value: number | null | undefined) {
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : null
}

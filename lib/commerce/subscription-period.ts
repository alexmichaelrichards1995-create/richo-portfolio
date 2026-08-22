import type Stripe from 'stripe'

export type SubscriptionPeriod = {
  currentPeriodStart: number | null
  currentPeriodEnd: number | null
}

type LegacySubscriptionPeriod = {
  current_period_start?: number
  current_period_end?: number
}

/**
 * Stripe API versions used by stripe-node v22.5.0 expose billing periods on
 * subscription items. R.I.C.H.O. creates one recurring Price per Checkout
 * Session, so the first item is the canonical period for the product access.
 *
 * The legacy subscription-level fallback is retained only for compatibility
 * with older webhook fixtures and does not override item-level data.
 */
export function subscriptionPeriod(subscription: Stripe.Subscription): SubscriptionPeriod {
  const item = subscription.items.data[0]

  if (item) {
    return {
      currentPeriodStart: item.current_period_start,
      currentPeriodEnd: item.current_period_end,
    }
  }

  const legacy = subscription as Stripe.Subscription & LegacySubscriptionPeriod
  return {
    currentPeriodStart:
      typeof legacy.current_period_start === 'number' ? legacy.current_period_start : null,
    currentPeriodEnd:
      typeof legacy.current_period_end === 'number' ? legacy.current_period_end : null,
  }
}

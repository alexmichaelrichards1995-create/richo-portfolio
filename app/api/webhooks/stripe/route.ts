import Stripe from 'stripe'
import { NextResponse, type NextRequest } from 'next/server'

import {
  entitlementTypeForDeliveryMode,
  normalizeStripeSubscriptionStatus,
  unixSecondsToIso,
} from '@/lib/commerce/fulfilment'
import { subscriptionPeriod } from '@/lib/commerce/subscription-period'
import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe/server'

export const runtime = 'nodejs'

function expandableId(value: string | { id: string } | null | undefined) {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

function metadataValue(metadata: Stripe.Metadata | null | undefined, key: string) {
  const value = metadata?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500)
  return 'Unknown webhook processing error'
}

async function claimEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: Stripe.Event,
) {
  const metadata: Json = {
    livemode: event.livemode,
    created: event.created,
    object_id:
      event.data.object && typeof event.data.object === 'object' && 'id' in event.data.object
        ? String(event.data.object.id)
        : null,
  }

  const { error } = await admin.from('payment_events').insert({
    id: event.id,
    provider: 'stripe',
    event_type: event.type,
    status: 'processing',
    metadata,
  })

  if (!error) return { claimed: true as const }
  if (error.code !== '23505') throw new Error(`Unable to claim payment event: ${error.message}`)

  const { data: existing, error: existingError } = await admin
    .from('payment_events')
    .select('status')
    .eq('id', event.id)
    .maybeSingle()

  if (existingError) throw new Error(`Unable to inspect payment event: ${existingError.message}`)
  if (existing?.status === 'processed' || existing?.status === 'ignored') {
    return { claimed: false as const, complete: true as const }
  }
  if (existing?.status === 'processing') {
    return { claimed: false as const, complete: false as const }
  }

  const { error: retryError } = await admin
    .from('payment_events')
    .update({ status: 'processing', error_message: null, processed_at: null })
    .eq('id', event.id)

  if (retryError) throw new Error(`Unable to retry payment event: ${retryError.message}`)
  return { claimed: true as const }
}

async function markEvent(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  status: 'processed' | 'failed' | 'ignored',
  entityId: string | null,
  errorMessage: string | null = null,
) {
  const { error } = await admin
    .from('payment_events')
    .update({
      status,
      entity_id: entityId,
      error_message: errorMessage,
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventId)

  if (error) throw new Error(`Unable to update payment event ledger: ${error.message}`)
}

async function loadOrder(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
) {
  const { data, error } = await admin
    .from('orders')
    .select('id, user_id, status, currency, total_amount, checkout_reference')
    .eq('id', orderId)
    .maybeSingle()

  if (error) throw new Error(`Unable to load order: ${error.message}`)
  if (!data) throw new Error(`Order ${orderId} was not found`)
  return data
}

async function loadOrderItem(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
) {
  const { data, error } = await admin
    .from('order_items')
    .select('id, product_id, metadata')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Unable to load order item: ${error.message}`)
  if (!data) throw new Error(`Order ${orderId} has no fulfilment item`)
  return data
}

function jsonMetadataValue(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = metadata[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

async function grantOrderEntitlement(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  status: 'active' | 'revoked' = 'active',
) {
  const order = await loadOrder(admin, orderId)
  const item = await loadOrderItem(admin, orderId)
  const deliveryMode = jsonMetadataValue(item.metadata, 'delivery_mode')
  if (!deliveryMode) throw new Error(`Order ${orderId} has no delivery mode snapshot`)

  const entitlementType = entitlementTypeForDeliveryMode(deliveryMode)
  const { error } = await admin.from('entitlements').upsert(
    {
      user_id: order.user_id,
      product_id: item.product_id,
      order_item_id: item.id,
      entitlement_type: entitlementType,
      status,
      metadata: {
        source: 'stripe_webhook',
        order_id: order.id,
      },
    },
    { onConflict: 'order_item_id' },
  )

  if (error) throw new Error(`Unable to synchronize entitlement: ${error.message}`)
}

async function processCheckoutSession(
  admin: ReturnType<typeof createAdminClient>,
  session: Stripe.Checkout.Session,
) {
  const orderId = metadataValue(session.metadata, 'richo_order_id') || session.client_reference_id
  if (!orderId) return { ignored: true as const, entityId: session.id }

  const order = await loadOrder(admin, orderId)
  if (order.checkout_reference && order.checkout_reference !== session.id) {
    throw new Error('Checkout Session does not match the order checkout reference')
  }

  if (session.amount_total !== null && session.amount_total !== order.total_amount) {
    throw new Error('Stripe Checkout total does not match the order snapshot')
  }

  if (session.currency && session.currency.toUpperCase() !== order.currency) {
    throw new Error('Stripe Checkout currency does not match the order snapshot')
  }

  const providerReference =
    session.mode === 'subscription'
      ? expandableId(session.subscription)
      : expandableId(session.payment_intent)

  if (session.payment_status === 'paid') {
    const { error } = await admin
      .from('orders')
      .update({
        status: 'paid',
        checkout_reference: session.id,
        provider_reference: providerReference,
        paid_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    if (error) throw new Error(`Unable to mark order paid: ${error.message}`)

    if (session.mode === 'payment') {
      await grantOrderEntitlement(admin, order.id, 'active')
    }
  } else {
    const { error } = await admin
      .from('orders')
      .update({
        status: 'processing',
        checkout_reference: session.id,
        provider_reference: providerReference,
      })
      .eq('id', order.id)

    if (error) throw new Error(`Unable to update processing order: ${error.message}`)
  }

  return { ignored: false as const, entityId: order.id }
}

async function failCheckoutSession(
  admin: ReturnType<typeof createAdminClient>,
  session: Stripe.Checkout.Session,
  status: 'failed' | 'cancelled',
) {
  const orderId = metadataValue(session.metadata, 'richo_order_id') || session.client_reference_id
  if (!orderId) return { ignored: true as const, entityId: session.id }

  const { error } = await admin
    .from('orders')
    .update({ status })
    .eq('id', orderId)
    .in('status', ['pending', 'processing'])

  if (error) throw new Error(`Unable to update checkout failure state: ${error.message}`)
  return { ignored: false as const, entityId: orderId }
}

async function processSubscription(
  admin: ReturnType<typeof createAdminClient>,
  subscription: Stripe.Subscription,
) {
  const userId = metadataValue(subscription.metadata, 'richo_user_id')
  const productId = metadataValue(subscription.metadata, 'richo_product_id')
  const orderId = metadataValue(subscription.metadata, 'richo_order_id')

  if (!userId || !productId) {
    return { ignored: true as const, entityId: subscription.id }
  }

  const normalizedStatus = normalizeStripeSubscriptionStatus(subscription.status)
  const providerCustomerId = expandableId(subscription.customer)
  const { currentPeriodStart, currentPeriodEnd } = subscriptionPeriod(subscription)
  const endedAt =
    typeof subscription.ended_at === 'number'
      ? unixSecondsToIso(subscription.ended_at)
      : normalizedStatus === 'cancelled' || normalizedStatus === 'expired'
        ? new Date().toISOString()
        : null

  const { error } = await admin.from('customer_subscriptions').upsert(
    {
      user_id: userId,
      product_id: productId,
      payment_provider: 'stripe',
      provider_customer_id: providerCustomerId,
      provider_subscription_id: subscription.id,
      status: normalizedStatus,
      current_period_start: unixSecondsToIso(currentPeriodStart),
      current_period_end: unixSecondsToIso(currentPeriodEnd),
      cancel_at_period_end: subscription.cancel_at_period_end,
      ended_at: endedAt,
      metadata: {
        source: 'stripe_webhook',
        stripe_status: subscription.status,
      },
    },
    { onConflict: 'payment_provider,provider_subscription_id' },
  )

  if (error) throw new Error(`Unable to synchronize customer subscription: ${error.message}`)

  if (orderId) {
    if (normalizedStatus === 'active' || normalizedStatus === 'trialing') {
      await grantOrderEntitlement(admin, orderId, 'active')
    } else if (normalizedStatus === 'cancelled' || normalizedStatus === 'expired') {
      await grantOrderEntitlement(admin, orderId, 'revoked')
    }
  }

  return { ignored: false as const, entityId: subscription.id }
}

async function dispatchEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: Stripe.Event,
) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return processCheckoutSession(admin, event.data.object as Stripe.Checkout.Session)

    case 'checkout.session.async_payment_failed':
      return failCheckoutSession(admin, event.data.object as Stripe.Checkout.Session, 'failed')

    case 'checkout.session.expired':
      return failCheckoutSession(admin, event.data.object as Stripe.Checkout.Session, 'cancelled')

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return processSubscription(admin, event.data.object as Stripe.Subscription)

    default:
      return { ignored: true as const, entityId: null }
  }
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 })
  }

  let stripe: Stripe
  let webhookSecret: string
  let rawBody: string

  try {
    stripe = getStripe()
    webhookSecret = getStripeWebhookSecret()
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid Stripe signature' }, { status: 400 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Webhook persistence is not configured' }, { status: 503 })
  }

  try {
    const claim = await claimEvent(admin, event)
    if (!claim.claimed) {
      if (claim.complete) {
        return NextResponse.json({ received: true, duplicate: true })
      }
      return NextResponse.json({ error: 'Event is already processing' }, { status: 409 })
    }

    const result = await dispatchEvent(admin, event)
    await markEvent(
      admin,
      event.id,
      result.ignored ? 'ignored' : 'processed',
      result.entityId,
    )

    return NextResponse.json({ received: true, ignored: result.ignored })
  } catch (error) {
    const message = safeErrorMessage(error)
    try {
      await markEvent(admin, event.id, 'failed', null, message)
    } catch {
      // Preserve the original processing failure so Stripe receives a non-2xx
      // response and retries the signed event.
    }

    console.error('Stripe webhook processing failed', {
      eventId: event.id,
      eventType: event.type,
      message,
    })

    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

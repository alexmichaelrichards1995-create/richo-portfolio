import crypto from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'

import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/server'

export const runtime = 'nodejs'

function metadataString(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function randomLetters(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

function siteUrl(request: NextRequest) {
  const configured = process.env.SITE_URL?.replace(/\/$/, '')
  if (configured) return configured
  if (process.env.NODE_ENV !== 'production') return request.nextUrl.origin
  throw new Error('SITE_URL is not configured')
}

function sameOriginAllowed(request: NextRequest, canonicalOrigin: string) {
  const origin = request.headers.get('origin')
  if (!origin) return true

  try {
    return new URL(origin).origin === new URL(canonicalOrigin).origin
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  let canonicalOrigin: string
  try {
    canonicalOrigin = siteUrl(request)
  } catch {
    return NextResponse.json({ error: 'Checkout is not configured' }, { status: 503 })
  }

  if (!sameOriginAllowed(request, canonicalOrigin)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getClaims()
  const claims = authData?.claims

  if (authError || !claims || typeof claims.sub !== 'string') {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const productId =
    body && typeof body === 'object' && 'productId' in body && typeof body.productId === 'string'
      ? body.productId
      : null

  if (!productId) {
    return NextResponse.json({ error: 'productId is required' }, { status: 400 })
  }

  let admin
  let stripe
  try {
    admin = createAdminClient()
    stripe = getStripe()
  } catch {
    return NextResponse.json({ error: 'Billing is not configured' }, { status: 503 })
  }

  const { data: product, error: productError } = await admin
    .from('products')
    .select('id, sku, slug, name, description, product_type, delivery_mode, status, price_amount, currency, metadata')
    .eq('id', productId)
    .eq('status', 'active')
    .maybeSingle()

  if (productError) {
    return NextResponse.json({ error: 'Unable to load product' }, { status: 500 })
  }

  if (!product) {
    return NextResponse.json({ error: 'Product is not available' }, { status: 404 })
  }

  const subscriptionPriceId = metadataString(product.metadata, 'stripe_price_id')
  if (product.product_type === 'subscription' && !subscriptionPriceId) {
    return NextResponse.json(
      { error: 'Subscription product is not configured for checkout' },
      { status: 409 },
    )
  }

  const storageBucket = metadataString(product.metadata, 'storage_bucket')
  const storagePath = metadataString(product.metadata, 'storage_path')
  if (product.delivery_mode === 'download' && (!storageBucket || !storagePath)) {
    return NextResponse.json(
      { error: 'Download product is not configured for secure delivery' },
      { status: 409 },
    )
  }

  const checkoutAttempt = crypto.randomUUID()
  const orderMetadata: Json = {
    source: 'richo_web_checkout',
    product_id: product.id,
    product_type: product.product_type,
    delivery_mode: product.delivery_mode,
    checkout_attempt: checkoutAttempt,
  }
  const orderItemMetadata: Json = {
    delivery_mode: product.delivery_mode,
    ...(storageBucket && storagePath
      ? {
          storage_bucket: storageBucket,
          storage_path: storagePath,
        }
      : {}),
  }

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      user_id: claims.sub,
      status: 'pending',
      currency: product.currency,
      subtotal_amount: product.price_amount,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: product.price_amount,
      payment_provider: 'stripe',
      idempotency_key: checkoutAttempt,
      metadata: orderMetadata,
    })
    .select('id')
    .single()

  if (orderError || !order) {
    return NextResponse.json({ error: 'Unable to create order' }, { status: 500 })
  }

  const { error: itemError } = await admin.from('order_items').insert({
    order_id: order.id,
    product_id: product.id,
    sku_snapshot: product.sku,
    name_snapshot: product.name,
    unit_amount: product.price_amount,
    quantity: 1,
    metadata: orderItemMetadata,
  })

  if (itemError) {
    await admin.from('orders').update({ status: 'failed' }).eq('id', order.id)
    return NextResponse.json({ error: 'Unable to snapshot order item' }, { status: 500 })
  }

  const commonMetadata = {
    richo_order_id: order.id,
    richo_user_id: claims.sub,
    richo_product_id: product.id,
    richo_product_type: product.product_type,
    richo_delivery_mode: product.delivery_mode,
  }

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: product.product_type === 'subscription' ? 'subscription' : 'payment',
        client_reference_id: order.id,
        customer_email: typeof claims.email === 'string' ? claims.email : undefined,
        success_url: `${canonicalOrigin}/protected?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${canonicalOrigin}/store/${encodeURIComponent(product.slug)}?checkout=cancelled`,
        integration_identifier: `richo_store_${randomLetters()}`,
        allow_promotion_codes: true,
        metadata: commonMetadata,
        line_items:
          product.product_type === 'subscription'
            ? [{ price: subscriptionPriceId!, quantity: 1 }]
            : [
                {
                  quantity: 1,
                  price_data: {
                    currency: product.currency.toLowerCase(),
                    unit_amount: product.price_amount,
                    product_data: {
                      name: product.name,
                      description: product.description || undefined,
                      metadata: {
                        richo_product_id: product.id,
                        richo_sku: product.sku,
                      },
                    },
                  },
                },
              ],
        payment_intent_data:
          product.product_type === 'subscription'
            ? undefined
            : {
                metadata: commonMetadata,
              },
        subscription_data:
          product.product_type === 'subscription'
            ? {
                metadata: commonMetadata,
              }
            : undefined,
      },
      { idempotencyKey: `richo-checkout-${checkoutAttempt}` },
    )

    if (!session.url) {
      throw new Error('Stripe Checkout Session did not return a hosted URL')
    }

    const { error: referenceError } = await admin
      .from('orders')
      .update({
        checkout_reference: session.id,
        status: 'processing',
        metadata: {
          ...orderMetadata,
          stripe_checkout_mode: session.mode,
        },
      })
      .eq('id', order.id)

    if (referenceError) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
      await admin.from('orders').update({ status: 'failed' }).eq('id', order.id)
      throw new Error('Unable to bind Checkout Session to order')
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    await admin.from('orders').update({ status: 'failed' }).eq('id', order.id)
    console.error('Stripe Checkout creation failed', {
      orderId: order.id,
      message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
    })
    return NextResponse.json({ error: 'Unable to create secure checkout' }, { status: 502 })
  }
}

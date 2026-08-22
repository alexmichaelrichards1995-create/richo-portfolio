import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/server'

export const runtime = 'nodejs'

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
    return NextResponse.json({ error: 'Billing portal is not configured' }, { status: 503 })
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

  const { data: subscription, error: subscriptionError } = await supabase
    .from('customer_subscriptions')
    .select('provider_customer_id, status')
    .eq('user_id', claims.sub)
    .eq('payment_provider', 'stripe')
    .not('provider_customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (subscriptionError) {
    return NextResponse.json({ error: 'Unable to load billing account' }, { status: 500 })
  }

  if (!subscription?.provider_customer_id) {
    return NextResponse.json({ error: 'No Stripe billing account is linked yet' }, { status: 409 })
  }

  let stripe
  try {
    stripe = getStripe()
  } catch {
    return NextResponse.json({ error: 'Billing portal is not configured' }, { status: 503 })
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.provider_customer_id,
      return_url: `${canonicalOrigin}/protected`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe Customer Portal creation failed', {
      userId: claims.sub,
      message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
    })
    return NextResponse.json({ error: 'Unable to open billing portal' }, { status: 502 })
  }
}

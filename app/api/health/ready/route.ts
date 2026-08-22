import { NextResponse } from 'next/server'

import { getStripe, getStripeWebhookSecret } from '@/lib/stripe/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

function readinessResponse(ready: boolean, status: number) {
  return NextResponse.json(
    {
      service: 'richo-systems-platform',
      ready,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

function assertCanonicalSiteUrl() {
  const configured = process.env.SITE_URL
  if (!configured) throw new Error('SITE_URL is not configured')

  const url = new URL(configured)
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('Production SITE_URL must use HTTPS')
  }
}

export async function GET() {
  try {
    assertCanonicalSiteUrl()
    getStripe()
    getStripeWebhookSecret()

    const admin = createAdminClient()
    const { error } = await admin.from('products').select('id', { head: true, count: 'exact' })
    if (error) throw new Error(`Commerce database is not ready: ${error.code || 'query_failed'}`)

    return readinessResponse(true, 200)
  } catch (error) {
    console.error('Customer commerce readiness check failed', {
      message: error instanceof Error ? error.message.slice(0, 300) : 'Unknown readiness error',
    })
    return readinessResponse(false, 503)
  }
}

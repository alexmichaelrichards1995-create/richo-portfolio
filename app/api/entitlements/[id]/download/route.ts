import { NextResponse } from 'next/server'

import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const DELIVERY_BUCKET = 'richo-digital-deliveries'
const SIGNED_URL_TTL_SECONDS = 120

function metadataString(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}

function accessWindowIsActive(startsAt: string | null, expiresAt: string | null) {
  const now = Date.now()
  if (startsAt && Date.parse(startsAt) > now) return false
  if (expiresAt && Date.parse(expiresAt) <= now) return false
  return true
}

function safeStoragePath(path: string) {
  if (!path || path.startsWith('/') || path.length > 1024) return false
  const segments = path.split('/')
  return !segments.some((segment) => segment === '..' || segment === '.')
}

function deliveryTypeAllowsAsset(entitlementType: string, assetKind: string | null) {
  if (entitlementType === 'download') return true
  return entitlementType === 'service_access' && assetKind === 'onboarding'
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!id) return errorResponse('Entitlement id is required', 400)

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getClaims()
  const claims = authData?.claims

  if (authError || !claims || typeof claims.sub !== 'string') {
    return errorResponse('Authentication required', 401)
  }

  const { data: entitlement, error: entitlementError } = await supabase
    .from('entitlements')
    .select('id, user_id, order_item_id, entitlement_type, status, starts_at, expires_at')
    .eq('id', id)
    .eq('user_id', claims.sub)
    .maybeSingle()

  if (entitlementError) return errorResponse('Unable to verify entitlement', 500)
  if (!entitlement) return errorResponse('Entitlement not found', 404)
  if (entitlement.status !== 'active') {
    return errorResponse('Delivery access is not active', 403)
  }
  if (!accessWindowIsActive(entitlement.starts_at, entitlement.expires_at)) {
    return errorResponse('Delivery access is outside its validity window', 403)
  }
  if (!entitlement.order_item_id) {
    return errorResponse('Delivery asset is not configured', 409)
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return errorResponse('Delivery is not configured', 503)
  }

  const { data: item, error: itemError } = await admin
    .from('order_items')
    .select('metadata')
    .eq('id', entitlement.order_item_id)
    .maybeSingle()

  if (itemError) return errorResponse('Unable to load delivery asset', 500)
  if (!item) return errorResponse('Delivery asset not found', 404)

  const bucket = metadataString(item.metadata, 'storage_bucket')
  const path = metadataString(item.metadata, 'storage_path')
  const assetKind = metadataString(item.metadata, 'delivery_asset_kind')

  if (!deliveryTypeAllowsAsset(entitlement.entitlement_type, assetKind)) {
    return errorResponse('This entitlement does not permit downloadable assets', 403)
  }
  if (bucket !== DELIVERY_BUCKET || !path || !safeStoragePath(path)) {
    return errorResponse('Delivery asset is not configured safely', 409)
  }

  const { data, error } = await admin.storage
    .from(DELIVERY_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: true })

  if (error || !data?.signedUrl) {
    return errorResponse('Unable to create secure download', 502)
  }

  const { data: receipt, error: receiptError } = await admin
    .from('audit_events')
    .insert({
      actor_user_id: claims.sub,
      event_type: 'delivery.signed_url_issued',
      entity_type: 'entitlement',
      entity_id: entitlement.id,
      metadata: {
        order_item_id: entitlement.order_item_id,
        bucket: DELIVERY_BUCKET,
        path,
        asset_kind: assetKind,
        entitlement_type: entitlement.entitlement_type,
        ttl_seconds: SIGNED_URL_TTL_SECONDS,
      },
    })
    .select('correlation_id, occurred_at')
    .single()

  if (receiptError || !receipt) {
    return errorResponse('Unable to record delivery receipt', 503)
  }

  const response = NextResponse.redirect(data.signedUrl, 302)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('X-RICHO-Delivery-Receipt', receipt.correlation_id)
  return response
}

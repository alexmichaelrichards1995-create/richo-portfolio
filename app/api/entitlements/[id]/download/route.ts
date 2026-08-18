import { NextResponse } from 'next/server'

import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

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
  if (entitlement.status !== 'active' || entitlement.entitlement_type !== 'download') {
    return errorResponse('Download access is not active', 403)
  }
  if (!accessWindowIsActive(entitlement.starts_at, entitlement.expires_at)) {
    return errorResponse('Download access is outside its validity window', 403)
  }
  if (!entitlement.order_item_id) {
    return errorResponse('Download delivery is not configured', 409)
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return errorResponse('Download delivery is not configured', 503)
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
  if (!bucket || !path) return errorResponse('Download delivery is not configured', 409)

  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, 120, { download: true })

  if (error || !data?.signedUrl) {
    return errorResponse('Unable to create secure download', 502)
  }

  return NextResponse.redirect(data.signedUrl, 302)
}

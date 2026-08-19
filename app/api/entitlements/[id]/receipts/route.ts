import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!id) return json({ error: 'Entitlement id is required' }, 400)

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getClaims()
  const claims = authData?.claims

  if (authError || !claims || typeof claims.sub !== 'string') {
    return json({ error: 'Authentication required' }, 401)
  }

  const { data: entitlement, error: entitlementError } = await supabase
    .from('entitlements')
    .select('id')
    .eq('id', id)
    .eq('user_id', claims.sub)
    .maybeSingle()

  if (entitlementError) return json({ error: 'Unable to verify entitlement' }, 500)
  if (!entitlement) return json({ error: 'Entitlement not found' }, 404)

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return json({ error: 'Delivery receipts are not configured' }, 503)
  }

  const { data: receipts, error: receiptError } = await admin
    .from('audit_events')
    .select('correlation_id, event_type, occurred_at, metadata')
    .eq('actor_user_id', claims.sub)
    .eq('entity_type', 'entitlement')
    .eq('entity_id', entitlement.id)
    .eq('event_type', 'delivery.signed_url_issued')
    .order('occurred_at', { ascending: false })
    .limit(20)

  if (receiptError) return json({ error: 'Unable to load delivery receipts' }, 500)

  return json({
    entitlement_id: entitlement.id,
    receipts: receipts ?? [],
  })
}

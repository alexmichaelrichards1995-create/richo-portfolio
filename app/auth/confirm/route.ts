import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const requestedNext = searchParams.get('next')
  const next = requestedNext?.startsWith('/') ? requestedNext : '/protected'

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL('/auth/error?error=Missing%20verification%20token', request.url))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    const url = new URL('/auth/error', request.url)
    url.searchParams.set('error', error.message)
    return NextResponse.redirect(url)
  }

  return NextResponse.redirect(new URL(next, request.url))
}

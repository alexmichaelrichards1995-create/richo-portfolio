import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    service: 'richo-systems-platform',
    runtime: 'nextjs',
    status: 'ok',
    supabaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  })
}

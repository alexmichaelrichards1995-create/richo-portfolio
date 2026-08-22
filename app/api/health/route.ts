import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json(
    {
      service: 'richo-systems-platform',
      status: 'ok',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

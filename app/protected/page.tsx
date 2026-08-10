import { redirect } from 'next/navigation'

import { LogoutButton } from '@/components/auth/logout-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

export default async function ProtectedPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims) {
    redirect('/auth/login')
  }

  const email = typeof data.claims.email === 'string' ? data.claims.email : 'Verified user'

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">R.I.C.H.O. protected workspace</CardTitle>
          <CardDescription>This page is rendered only after server-side Supabase claim verification.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Authenticated identity</p>
            <p className="mt-2 font-medium">{email}</p>
          </div>
          <p className="text-sm text-muted-foreground">Next we can replace this verification surface with the customer dashboard, purchases, subscriptions, downloads and account controls.</p>
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  )
}

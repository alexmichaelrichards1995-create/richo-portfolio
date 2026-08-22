import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignUpSuccessPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>Your account request was accepted by Supabase Auth.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Open the verification message sent to your email, then return to R.I.C.H.O. to continue.</p>
          <Link href="/auth/login" className="text-foreground underline underline-offset-4">Return to sign in</Link>
        </CardContent>
      </Card>
    </main>
  )
}

import { redirect } from 'next/navigation'

import { LogoutButton } from '@/components/auth/logout-button'
import { ManageBillingButton } from '@/components/billing/manage-billing-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency,
    }).format(amount / 100)
  } catch {
    return `${currency} ${(amount / 100).toFixed(2)}`
  }
}

function formatDate(value: string | null) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full border bg-muted px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {value.replaceAll('_', ' ')}
    </span>
  )
}

export default async function ProtectedPage() {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getClaims()

  if (authError || !authData?.claims || typeof authData.claims.sub !== 'string') {
    redirect('/auth/login')
  }

  const userId = authData.claims.sub
  const email = typeof authData.claims.email === 'string' ? authData.claims.email : 'Verified user'

  const [profileResult, ordersResult, entitlementsResult, subscriptionsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, company_name, country_code, timezone, updated_at')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('orders')
      .select('id, status, currency, total_amount, created_at, paid_at')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('entitlements')
      .select('id, entitlement_type, status, starts_at, expires_at')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('customer_subscriptions')
      .select('id, status, payment_provider, current_period_end, cancel_at_period_end')
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const profile = profileResult.data
  const orders = ordersResult.data ?? []
  const entitlements = entitlementsResult.data ?? []
  const subscriptions = subscriptionsResult.data ?? []
  const hasStripeSubscription = subscriptions.some((item) => item.payment_provider === 'stripe')
  const hasDataError = Boolean(
    profileResult.error || ordersResult.error || entitlementsResult.error || subscriptionsResult.error,
  )

  return (
    <main className="min-h-svh bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">R.I.C.H.O. Systems</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Customer control panel</h1>
            <p className="mt-2 text-sm text-muted-foreground">{email}</p>
          </div>
          <LogoutButton />
        </header>

        {hasDataError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Some account data could not be loaded. Authentication remains valid; retry after the database connection is configured.
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Orders</CardDescription>
              <CardTitle className="text-3xl">{orders.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Recent orders visible to this account.</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Active entitlements</CardDescription>
              <CardTitle className="text-3xl">{entitlements.filter((item) => item.status === 'active').length}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Downloads, software access and service rights.</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Active subscriptions</CardDescription>
              <CardTitle className="text-3xl">{subscriptions.filter((item) => item.status === 'active' || item.status === 'trialing').length}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Subscription state is server-synchronised.</CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Customer-owned account metadata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground">Display name</p>
                <p className="mt-1 font-medium">{profile?.display_name || 'Not set'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Company</p>
                <p className="mt-1 font-medium">{profile?.company_name || 'Not set'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">Country</p>
                  <p className="mt-1 font-medium">{profile?.country_code || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Timezone</p>
                  <p className="mt-1 font-medium">{profile?.timezone || 'Australia/Brisbane'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent orders</CardTitle>
              <CardDescription>Read-only order history. Payment writes remain server controlled.</CardDescription>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <div className="divide-y">
                  {orders.map((order) => (
                    <div key={order.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{formatMoney(order.total_amount, order.currency)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Order {order.id.slice(0, 8)} · {formatDate(order.created_at)}</p>
                      </div>
                      <StatusPill value={order.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Entitlements</CardTitle>
              <CardDescription>Access granted by completed commercial workflows.</CardDescription>
            </CardHeader>
            <CardContent>
              {entitlements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No entitlements have been granted yet.</p>
              ) : (
                <div className="divide-y">
                  {entitlements.map((entitlement) => (
                    <div key={entitlement.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                      <div>
                        <p className="font-medium capitalize">{entitlement.entitlement_type.replaceAll('_', ' ')}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Starts {formatDate(entitlement.starts_at)} · Expires {formatDate(entitlement.expires_at)}
                        </p>
                      </div>
                      <StatusPill value={entitlement.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscriptions</CardTitle>
              <CardDescription>Customer-visible lifecycle state only; provider credentials remain private.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {hasStripeSubscription ? <ManageBillingButton /> : null}
              {subscriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
              ) : (
                <div className="divide-y">
                  {subscriptions.map((subscription) => (
                    <div key={subscription.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                      <div>
                        <p className="font-medium capitalize">{subscription.payment_provider}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Period ends {formatDate(subscription.current_period_end)}
                          {subscription.cancel_at_period_end ? ' · Cancels at period end' : ''}
                        </p>
                      </div>
                      <StatusPill value={subscription.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <p className="text-xs leading-5 text-muted-foreground">
          This migration branch is not production deployment authorisation. Orders, entitlements and subscription mutations remain server/service-role controlled.
        </p>
      </div>
    </main>
  )
}

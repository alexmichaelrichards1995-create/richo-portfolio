import Link from 'next/link'
import { notFound } from 'next/navigation'

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

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: product, error } = await supabase
    .from('products')
    .select('id, sku, slug, name, description, product_type, delivery_mode, price_amount, currency')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    return (
      <main className="min-h-svh bg-background px-4 py-10 text-foreground sm:px-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Product connection pending</CardTitle>
            <CardDescription>This product page could not reach the configured Supabase catalog.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link className="text-sm font-medium underline underline-offset-4" href="/store">Return to store</Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (!product) notFound()

  return (
    <main className="min-h-svh bg-background px-4 py-10 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <div className="mb-3 flex flex-wrap gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <span>{product.product_type.replaceAll('_', ' ')}</span>
              <span>·</span>
              <span>{product.sku}</span>
            </div>
            <CardTitle className="text-3xl">{product.name}</CardTitle>
            <CardDescription className="text-base leading-7">
              {product.description || 'Digital R.I.C.H.O. product.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Delivery</p>
              <p className="mt-2 font-medium capitalize">{product.delivery_mode.replaceAll('_', ' ')}</p>
            </div>
            <Link className="text-sm font-medium underline underline-offset-4" href="/store">← Back to digital products</Link>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardDescription>Price</CardDescription>
            <CardTitle className="text-4xl">{formatMoney(product.price_amount, product.currency)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link
              href="/auth/login"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in to continue
            </Link>
            <p className="text-xs leading-5 text-muted-foreground">
              Checkout is not enabled by this migration branch yet. Payment creation will remain server-side and will only be connected after the existing Stripe/marketplace work is reconciled with the new order schema.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

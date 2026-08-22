import Link from 'next/link'

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

export default async function StorePage() {
  const supabase = await createClient()
  const { data: products, error } = await supabase
    .from('products')
    .select('id, sku, slug, name, description, product_type, delivery_mode, price_amount, currency')
    .eq('status', 'active')
    .order('price_amount', { ascending: true })

  return (
    <main className="min-h-svh bg-background px-4 py-10 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">R.I.C.H.O. Systems</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Digital products</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Software access, digital downloads, subscriptions and professional technology services. Only products published through the secured Supabase catalog are shown here.
            </p>
          </div>
          <Link className="text-sm font-medium underline underline-offset-4" href="/">
            Back to platform
          </Link>
        </header>

        {error ? (
          <Card>
            <CardHeader>
              <CardTitle>Catalog connection pending</CardTitle>
              <CardDescription>The store UI is ready, but this environment could not read the Supabase catalog.</CardDescription>
            </CardHeader>
          </Card>
        ) : products && products.length > 0 ? (
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <Card key={product.id} className="flex h-full flex-col">
                <CardHeader>
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-wide text-muted-foreground">
                    <span>{product.product_type.replaceAll('_', ' ')}</span>
                    <span>{product.sku}</span>
                  </div>
                  <CardTitle className="text-xl">{product.name}</CardTitle>
                  <CardDescription>{product.description || 'Digital R.I.C.H.O. product.'}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-4">
                  <div>
                    <p className="text-2xl font-semibold">{formatMoney(product.price_amount, product.currency)}</p>
                    <p className="mt-1 text-xs text-muted-foreground capitalize">Delivery: {product.delivery_mode.replaceAll('_', ' ')}</p>
                  </div>
                  <Link
                    href={`/store/${product.slug}`}
                    className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    View product
                  </Link>
                </CardContent>
              </Card>
            ))}
          </section>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Catalog ready</CardTitle>
              <CardDescription>No products are published in this environment yet. Draft products stay hidden by Row Level Security.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </main>
  )
}

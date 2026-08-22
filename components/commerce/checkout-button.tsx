'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'

export function CheckoutButton({ productId }: { productId: string }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout() {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      })

      const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null

      if (!response.ok || !body?.url) {
        throw new Error(body?.error || 'Unable to start checkout')
      }

      window.location.assign(body.url)
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start checkout')
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" className="h-11 w-full" onClick={startCheckout} disabled={isLoading}>
        {isLoading ? 'Opening secure checkout…' : 'Continue to secure checkout'}
      </Button>
      {error ? <p className="text-xs leading-5 text-destructive">{error}</p> : null}
    </div>
  )
}

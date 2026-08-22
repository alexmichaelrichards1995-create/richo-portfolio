'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'

export function ManageBillingButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openPortal() {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
      })
      const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null

      if (!response.ok || !body?.url) {
        throw new Error(body?.error || 'Unable to open billing portal')
      }

      window.location.assign(body.url)
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : 'Unable to open billing portal')
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={openPortal} disabled={isLoading}>
        {isLoading ? 'Opening billing…' : 'Manage billing'}
      </Button>
      {error ? <p className="text-xs leading-5 text-destructive">{error}</p> : null}
    </div>
  )
}

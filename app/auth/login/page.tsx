import { LoginForm } from '@/components/auth/login-form'

function safeNextPath(value: string | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/protected'
  return value
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <LoginForm nextPath={safeNextPath(params.next)} />
    </main>
  )
}

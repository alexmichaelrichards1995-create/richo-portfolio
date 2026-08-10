import Link from 'next/link'

const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
)

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">R.I.C.H.O. SYSTEMS</p>
        <h1>Next.js + Supabase application foundation</h1>
        <p className="lede">
          The migration branch now includes Supabase SSR, shadcn/Tailwind UI foundations and a complete
          password-authentication flow while remaining isolated from the current production/static site.
        </p>

        <div className="statusGrid">
          <article className="statusCard">
            <span>Runtime</span>
            <strong>Next.js 16</strong>
          </article>
          <article className="statusCard">
            <span>Database / Auth</span>
            <strong>Supabase SSR</strong>
          </article>
          <article className="statusCard">
            <span>Environment</span>
            <strong>{supabaseConfigured ? 'Configured' : 'Awaiting local/deploy env'}</strong>
          </article>
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/auth/login" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
            Sign in
          </Link>
          <Link href="/auth/sign-up" className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-5 text-sm font-medium hover:bg-accent">
            Create account
          </Link>
          <Link href="/protected" className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-5 text-sm font-medium hover:bg-accent">
            Protected workspace
          </Link>
        </div>

        <div className="notice">
          No production deployment or main-branch replacement is authorised by this migration branch.
        </div>
      </section>
    </main>
  )
}

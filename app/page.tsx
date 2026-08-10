const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
)

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">R.I.C.H.O. SYSTEMS</p>
        <h1>Next.js + Supabase foundation</h1>
        <p className="lede">
          The platform migration is isolated from the current static site. This branch establishes the
          application runtime, Supabase SSR clients, and CI before authentication, commerce, and product
          dashboards are enabled.
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

        <div className="notice">
          No production deployment or main-branch replacement is authorised by this migration branch.
        </div>
      </section>
    </main>
  )
}

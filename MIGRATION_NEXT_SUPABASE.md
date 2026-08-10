# R.I.C.H.O. Next.js + Supabase Migration

Branch: `agent/nextjs-supabase-foundation`

## Purpose

Create a reversible application foundation for R.I.C.H.O. Systems using Next.js App Router and Supabase without overwriting the current static site or authorising production deployment.

## Foundation included

- Next.js 16 App Router
- React 19
- TypeScript
- Node.js 22 runtime target
- `@supabase/supabase-js`
- `@supabase/ssr`
- Browser and server Supabase client utilities
- Next.js `proxy.ts` session-refresh path
- `/api/health` endpoint
- GitHub Actions typecheck/build validation
- `.env.example` only; real environment values are not committed

## Existing site preservation

The existing `index.html`, `app.js`, `catalog.js`, `styles.css`, assets, Netlify configuration, and current deployment files remain in the branch as migration source material. They have not been deleted or replaced.

## Not yet authorised or completed

- Merge to `main`
- Production deployment
- Supabase schema creation
- Row Level Security policies
- Customer authentication UI
- Product/customer database migration
- Payment integration
- Storage buckets
- Realtime subscriptions
- Admin dashboard
- shadcn/Supabase UI component installation
- Agent Skills installation

## Environment setup

Create `.env.local` outside version control and set:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Never place a Supabase service-role/secret key in client code or `NEXT_PUBLIC_*` variables.

## Next migration gate

The foundation must pass dependency installation, TypeScript validation, and `next build` in CI before auth/database/UI work proceeds.

import pg from 'pg';

export function normalizeDatabaseUrl(raw) {
  if (!raw) return null;
  const url = new URL(raw);
  const host = (url.hostname || '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    const mode = url.searchParams.get('sslmode');
    if (!mode || ['prefer', 'require', 'verify-ca'].includes(mode)) {
      url.searchParams.set('sslmode', 'verify-full');
    }
  }
  return url.toString();
}

export async function checkDatabase() {
  if (!process.env.DATABASE_URL) return { reachable: false, configured: false };
  const pool = new pg.Pool({ connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL), max: 1 });
  try {
    await pool.query('select 1');
    return { reachable: true, configured: true };
  } catch {
    return { reachable: false, configured: true };
  } finally {
    await pool.end().catch(() => {});
  }
}

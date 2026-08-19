import pg from 'pg';
import { assertRuntimeConfig } from '../lib/runtime-guards.server';

const { Pool } = pg;
let pool: pg.Pool | null = null;

export function getDb() {
  assertRuntimeConfig(process.env);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
    });
    pool.on('error', (error) => console.error('richo.db.pool_error', error));
  }
  return pool;
}

export async function closeDbForTests() {
  if (pool) await pool.end();
  pool = null;
}

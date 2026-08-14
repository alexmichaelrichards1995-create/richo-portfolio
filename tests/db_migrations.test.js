// Verify required migrations are applied.
// Run: node tests/db_migrations.test.js

const { Client } = require('pg');

(async () => {
  const connection = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
  const c = new Client({ connectionString: connection });
  try {
    await c.connect();
    const res = await c.query(`
      SELECT
        to_regclass('public.subscriptions') AS subscriptions,
        to_regclass('public.payment_intents') AS payment_intents,
        to_regclass('public.payment_attempts') AS payment_attempts,
        to_regclass('public.webhook_receipts') AS webhook_receipts,
        to_regclass('public.paycore_kv') AS paycore_kv
    `);

    for (const required of [
      'subscriptions',
      'payment_intents',
      'payment_attempts',
      'webhook_receipts',
      'paycore_kv',
    ]) {
      if (!res.rows[0][required]) throw new Error(`${required} table not found`);
    }

    const receiptPk = await c.query(`
      SELECT pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'webhook_receipts'
        AND con.contype = 'p'
    `);
    if (!receiptPk.rowCount || !/provider, event_id/.test(receiptPk.rows[0].definition)) {
      throw new Error('webhook_receipts must deduplicate by provider + event_id');
    }

    console.log('OK: subscriptions and authoritative PayCore revenue schema are present');
    process.exit(0);
  } catch (err) {
    console.error('FAILED', err && err.message);
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
})();

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
        to_regclass('public.verified_purchases') AS verified_purchases
    `);

    if (!res.rows[0].subscriptions) throw new Error('subscriptions table not found');
    if (!res.rows[0].verified_purchases) throw new Error('verified_purchases table not found');

    const columns = await c.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'verified_purchases'
    `);
    const names = new Set(columns.rows.map(row => row.column_name));
    for (const required of [
      'checkout_session_id',
      'amount_minor',
      'currency',
      'analytics_event_uuid',
      'analytics_sent_at',
      'analytics_attempts',
    ]) {
      if (!names.has(required)) throw new Error(`verified_purchases missing column: ${required}`);
    }

    console.log('OK: subscriptions and verified purchase revenue ledger migrations are present');
    process.exit(0);
  } catch (err) {
    console.error('FAILED', err && err.message);
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
})();

// Verify migrations applied: check subscriptions and webhook_deliveries tables exist
// Run: node tests/db_migrations.test.js

const { Client } = require('pg');

(async () => {
  const connection = process.env.DATABASE_URL;
  if (!connection) {
    console.error('FAILED: DATABASE_URL is required');
    process.exit(1);
  }
  const c = new Client({ connectionString: connection });
  try {
    await c.connect();
    const tableRes = await c.query("SELECT to_regclass('public.subscriptions') as subscriptions_tbl, to_regclass('public.webhook_deliveries') as deliveries_tbl");
    if (!tableRes.rows[0].subscriptions_tbl) {
      console.error('FAILED: subscriptions table not found');
      process.exit(1);
    }
    if (!tableRes.rows[0].deliveries_tbl) {
      console.error('FAILED: webhook_deliveries table not found');
      process.exit(1);
    }

    const columnRes = await c.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'subscriptions' AND column_name IN ('tier', 'effective_at')
    `);
    const columns = new Set(columnRes.rows.map((row) => row.column_name));
    if (!columns.has('tier') || !columns.has('effective_at')) {
      console.error('FAILED: subscriptions.tier/effective_at columns not found');
      process.exit(1);
    }

    console.log('OK: required migrations are present');
    process.exit(0);
  } catch (err) {
    console.error('FAILED', err && err.message);
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
})();

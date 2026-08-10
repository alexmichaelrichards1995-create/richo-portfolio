// Verify migrations applied: check subscriptions table exists
// Run: node tests/db_migrations.test.js

const { Client } = require('pg');

(async () => {
  const connection = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
  const c = new Client({ connectionString: connection });
  try {
    await c.connect();
    const res = await c.query("SELECT to_regclass('public.subscriptions') as tbl");
    if (!res.rows[0].tbl) {
      console.error('FAILED: subscriptions table not found');
      process.exit(1);
    }
    console.log('OK: subscriptions table exists');
    process.exit(0);
  } catch (err) {
    console.error('FAILED', err && err.message);
    process.exit(1);
  } finally {
    await c.end().catch(()=>{});
  }
})();
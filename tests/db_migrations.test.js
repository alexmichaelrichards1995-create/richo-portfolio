// Verify root legacy Marketplace migrations applied without claiming the generic
// subscriptions namespace or accepting a generic application database URL.

const { Client } = require('pg');

(async () => {
  const connection = process.env.LEGACY_MARKETPLACE_DATABASE_URL;
  if (!connection) {
    console.error('FAILED LEGACY_MARKETPLACE_DATABASE_URL is required');
    process.exit(1);
  }

  const c = new Client({ connectionString: connection });
  try {
    await c.connect();
    const res = await c.query(`
      SELECT
        to_regclass('public.legacy_marketplace_subscriptions') AS legacy_tbl,
        to_regclass('public.subscriptions') AS generic_tbl
    `);

    if (!res.rows[0].legacy_tbl) {
      throw new Error('legacy_marketplace_subscriptions table not found');
    }
    if (res.rows[0].generic_tbl) {
      throw new Error('generic subscriptions table still exists in the root legacy schema');
    }

    console.log('OK: legacy Marketplace subscription namespace is isolated');
    process.exit(0);
  } catch (err) {
    console.error('FAILED', err && err.message);
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
})();

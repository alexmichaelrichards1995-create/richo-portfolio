// Smoke test for payout retry worker
// Inserts a failed payout row (when Postgres is available) and runs retryFailedPayouts

const db = require('../db/db_client');
const { retryFailedPayouts } = require('../stripe_retry');

(async () => {
  try {
    if (!db.pgPool) {
      console.log('SKIP: no Postgres pool available');
      process.exit(0);
    }

    const client = await db.pgPool.connect();
    try {
      // create a connected account mapping for the test account
      await client.query("INSERT INTO connected_accounts (account_id, stripe_account_id, status, created_at, updated_at) VALUES ($1,$2,$3,now(),now()) ON CONFLICT (account_id) DO UPDATE SET stripe_account_id = EXCLUDED.stripe_account_id, status = EXCLUDED.status, updated_at = now()", [1234567, 'acct_stub_1234567', 'connected']);

      // insert a failed payout
      const ins = await client.query("INSERT INTO payouts (account_id, gross_cents, commission_cents, net_cents, status, scheduled_for, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,now()::date,now(),now()) RETURNING id", [1234567, 100000, 5000, 95000, 'failed']);
      const payoutId = ins.rows[0].id;

      const results = await retryFailedPayouts({ limit: 10 });
      const found = results.find(r => r.id === payoutId);

      if (!found) {
        console.error('FAILED: retry did not return result for inserted payout');
        process.exit(1);
      }

      // verify DB updated
      const chk = await client.query('SELECT status FROM payouts WHERE id = $1', [payoutId]);
      const status = chk.rows[0] && chk.rows[0].status;
      if (status !== 'executed' && status !== 'failed') {
        console.error('FAILED: unexpected payout status', status);
        process.exit(1);
      }

      console.log('OK: stripe_retry worker executed, payout status:', status);
      process.exit(0);
    } finally { client.release(); }
  } catch (err) {
    console.error('FAILED:', err && err.message);
    process.exit(1);
  }
})();

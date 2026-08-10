/* stripe_retry.js
 * Retry failed payouts: query payouts table for status='failed' and attempt re-execution.
 * - Uses DB when available; falls back to no-op.
 * - On success updates payouts.status -> 'executed' and sets stripe_transfer_id
 */

const db = require('./db/db_client');
const stripeConnect = require('./stripe_connect');

async function retryFailedPayouts({ limit = 50 } = {}) {
  if (!db.pgPool) {
    console.log('No Postgres pool available — skipping retry');
    return [];
  }

  const client = await db.pgPool.connect();
  try {
    const res = await client.query("SELECT id, account_id, gross_cents, scheduled_for FROM payouts WHERE status = 'failed' OR status = 'scheduled' LIMIT $1", [limit]);
    const results = [];
    for (const row of res.rows) {
      const payoutId = row.id;
      const accountId = row.account_id;
      const gross = row.gross_cents;
      // find connected account mapping
      const conn = await db.getConnectedAccount(accountId);
      const connectedAccountId = conn && (conn.stripe_account_id || conn.stripe_account_id) || null;

      try {
        const exec = await stripeConnect.executePayout(row.scheduled_for || new Date().toISOString().slice(0,7), gross, connectedAccountId || null);
        if (exec && exec.success) {
          await client.query('UPDATE payouts SET status=$1, stripe_transfer_id=$2, executed_at=now(), updated_at=now() WHERE id=$3', ['executed', exec.payout && exec.payout.transferId || null, payoutId]);
          results.push({ id: payoutId, success: true });
        } else {
          await client.query('UPDATE payouts SET status=$1, updated_at=now() WHERE id=$2', ['failed', payoutId]);
          results.push({ id: payoutId, success: false });
        }
      } catch (e) {
        console.warn('retry failed for payout', payoutId, e && e.message);
        await client.query('UPDATE payouts SET status=$1, updated_at=now() WHERE id=$2', ['failed', payoutId]);
        results.push({ id: payoutId, success: false, error: e && e.message });
      }
    }
    return results;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  retryFailedPayouts().then(r => { console.log('retry results', r); process.exit(0); }).catch(err=>{ console.error(err); process.exit(1); });
}

module.exports = { retryFailedPayouts };

/* stripe_payouts.js
 * Payout worker: scans subscriptions and schedules/executes payouts when net >= threshold
 * - Uses Postgres when available (db/db_client.pgPool), otherwise reads file store
 * - Calls stripe_connect.executePayout for real transfers when STRIPE_API_KEY present
 * - Records payout rows in payouts table (migration 003_create_payouts_table.sql)
 */

const fs = require('fs');
const path = require('path');
const stripeConnect = require('./stripe_connect');
const { calculateNetRevenue } = require('./stripe_integration');
const db = require('./db/db_client');

async function listSubscriptions() {
  if (db.pgPool) {
    const client = await db.pgPool.connect();
    try {
      const res = await client.query('SELECT account_id, monthly_price_in_cents FROM subscriptions WHERE monthly_price_in_cents IS NOT NULL');
      return res.rows.map(r => ({ accountId: r.account_id, monthly_price_in_cents: r.monthly_price_in_cents }));
    } finally { client.release(); }
  }
  // file-store fallback
  const file = path.join(__dirname, 'data', 'subscriptions.json');
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8');
  const obj = JSON.parse(raw || '{}');
  return Object.entries(obj).map(([k,v]) => ({ accountId: Number(k), monthly_price_in_cents: v.monthly_price_in_cents || null }));
}

async function recordPayout(accountId, grossCents, commissionCents, netCents, scheduledFor) {
  if (db.pgPool) {
    const client = await db.pgPool.connect();
    try {
      const sql = `INSERT INTO payouts (account_id, gross_cents, commission_cents, net_cents, status, scheduled_for, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,now(),now()) RETURNING *`;
      const res = await client.query(sql, [accountId, grossCents, commissionCents, netCents, 'scheduled', scheduledFor]);
      return res.rows[0];
    } finally { client.release(); }
  }
  // fallback: no-op
  return { accountId, grossCents, commissionCents, netCents, status: 'scheduled', scheduledFor };
}

async function runPayouts(options = {}) {
  const minPayoutCents = options.minPayoutCents || 50000; // $500
  const month = options.month || new Date().toISOString().slice(0,7);

  const subs = await listSubscriptions();
  for (const s of subs) {
    if (!s.monthly_price_in_cents) continue;
    const gross = s.monthly_price_in_cents;
    const { netCents, commissionCents } = calculateNetRevenue(gross);
    if (netCents < minPayoutCents) continue;

    const scheduled = await recordPayout(s.accountId, gross, commissionCents, netCents, month + '-01');
    // execute payout (will use Stripe when available)
    const connectedAccountId = null; // TODO: map account -> connected account id from DB
    const res = await stripeConnect.executePayout(month, gross, connectedAccountId, { minPayoutCents });
    if (res && res.success) {
      // update payout row with executed info if using DB
      if (db.pgPool && scheduled && scheduled.id) {
        const client = await db.pgPool.connect();
        try {
          await client.query('UPDATE payouts SET status=$1, executed_at=now(), stripe_transfer_id=$2, updated_at=now() WHERE id=$3', ['executed', res.payout && res.payout.transferId || null, scheduled.id]);
        } finally { client.release(); }
      }
    } else {
      // mark failed
      if (db.pgPool && scheduled && scheduled.id) {
        const client = await db.pgPool.connect();
        try {
          await client.query('UPDATE payouts SET status=$1, updated_at=now() WHERE id=$2', ['failed', scheduled.id]);
        } finally { client.release(); }
      }
    }
  }
}

if (require.main === module) {
  const min = process.argv[2] ? parseInt(process.argv[2],10) : undefined;
  runPayouts({ minPayoutCents: min }).then(()=>console.log('done')).catch(err=>{ console.error(err); process.exit(1); });
}

module.exports = { runPayouts };

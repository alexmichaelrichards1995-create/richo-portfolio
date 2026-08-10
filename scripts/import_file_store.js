/* scripts/import_file_store.js
 * Simple script to import file-backed stores (data/subscriptions.json) into Postgres subscriptions table.
 * Usage: node scripts/import_file_store.js <DATABASE_URL>
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const dbUrl = process.argv[2] || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('Usage: node scripts/import_file_store.js <DATABASE_URL>');
    process.exit(2);
  }

  const file = path.join(__dirname, '..', 'data', 'subscriptions.json');
  if (!fs.existsSync(file)) {
    console.error('No file-backed subscriptions store found at', file);
    process.exit(0);
  }

  const raw = fs.readFileSync(file, 'utf8');
  const obj = JSON.parse(raw || '{}');
  const entries = Object.entries(obj);
  if (!entries.length) {
    console.log('No subscriptions to import');
    process.exit(0);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const [accountId, rec] of entries) {
      const sql = `INSERT INTO subscriptions (account_id, account_login, plan_id, plan_name, monthly_price_in_cents, status, billing_cycle_start, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
        ON CONFLICT (account_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, plan_name = EXCLUDED.plan_name, monthly_price_in_cents = EXCLUDED.monthly_price_in_cents, status = EXCLUDED.status, updated_at = now()`;
      const vals = [parseInt(accountId,10), rec.account_login || null, rec.planId || rec.plan_id || null, rec.planName || rec.plan_name || null, rec.monthly_price_in_cents || rec.monthly_price_in_cents || null, rec.status || 'active', rec.billing_cycle_start || null];
      await client.query(sql, vals);
    }
    await client.query('COMMIT');
    console.log(`Imported ${entries.length} subscriptions`);
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('Import failed', e && e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

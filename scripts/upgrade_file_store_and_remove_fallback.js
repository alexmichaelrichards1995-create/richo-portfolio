#!/usr/bin/env node
/* scripts/upgrade_file_store_and_remove_fallback.js
 * Safe upgrader to import file-backed stores into Postgres and back up the files.
 * Usage: node scripts/upgrade_file_store_and_remove_fallback.js <DATABASE_URL>
 * - Imports data/subscriptions.json into subscriptions
 * - Imports data/connected_accounts.json into connected_accounts
 * - Runs inside a DB transaction for each table set; on success renames files to .bak.<ts>
 * - Idempotent: running twice will upsert and produce backups with timestamp
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  const raw = await fs.promises.readFile(p, 'utf8');
  try { return JSON.parse(raw || '{}'); } catch (e) { throw new Error('invalid json in ' + p + ': ' + e.message); }
}

function backupFile(p) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = p + '.bak.' + ts;
  fs.renameSync(p, dest);
  return dest;
}

async function importSubscriptions(client, subsObj) {
  const entries = Object.entries(subsObj || {});
  if (!entries.length) return 0;
  for (const [accountId, rec] of entries) {
    const sql = `INSERT INTO subscriptions (account_id, account_login, plan_id, plan_name, monthly_price_in_cents, status, billing_cycle_start, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
      ON CONFLICT (account_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, plan_name = EXCLUDED.plan_name, monthly_price_in_cents = EXCLUDED.monthly_price_in_cents, status = EXCLUDED.status, updated_at = now()`;
    const vals = [parseInt(accountId,10), rec.account_login || null, rec.planId || rec.plan_id || null, rec.planName || rec.plan_name || null, rec.monthly_price_in_cents || rec.monthly_price_in_cents || null, rec.status || 'active', rec.billing_cycle_start || null];
    await client.query(sql, vals);
  }
  return entries.length;
}

async function importConnectedAccounts(client, connObj) {
  const entries = Object.entries(connObj || {});
  if (!entries.length) return 0;
  for (const [accountId, rec] of entries) {
    const sql = `INSERT INTO connected_accounts (account_id, stripe_account_id, status, created_at, updated_at)
      VALUES ($1,$2,$3, now(), now())
      ON CONFLICT (account_id) DO UPDATE SET stripe_account_id = EXCLUDED.stripe_account_id, status = EXCLUDED.status, updated_at = now()`;
    const vals = [accountId ? parseInt(accountId,10) : null, rec.stripeAccountId || rec.stripe_account_id || null, rec.status || 'pending'];
    await client.query(sql, vals);
  }
  return entries.length;
}

async function main() {
  const dbUrl = process.argv[2] || process.env.DATABASE_URL;
  if (!dbUrl) { console.error('Usage: node scripts/upgrade_file_store_and_remove_fallback.js <DATABASE_URL>'); process.exit(2); }

  const dataDir = path.join(__dirname, '..', 'data');
  const subsFile = path.join(dataDir, 'subscriptions.json');
  const connFile = path.join(dataDir, 'connected_accounts.json');

  const subsObj = await readJsonIfExists(subsFile);
  const connObj = await readJsonIfExists(connFile);

  if (!subsObj && !connObj) { console.log('No file-store data found to import.'); process.exit(0); }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    let importedSubs = 0, importedConns = 0;
    await client.query('BEGIN');
    if (subsObj) importedSubs = await importSubscriptions(client, subsObj);
    if (connObj) importedConns = await importConnectedAccounts(client, connObj);
    await client.query('COMMIT');
    console.log('Imported', importedSubs, 'subscriptions and', importedConns, 'connected accounts');

    if (subsObj && fs.existsSync(subsFile)) {
      const dest = backupFile(subsFile);
      console.log('Backed up', subsFile, '->', dest);
    }
    if (connObj && fs.existsSync(connFile)) {
      const dest = backupFile(connFile);
      console.log('Backed up', connFile, '->', dest);
    }

    console.log('Upgrade complete. Remove file-store fallback after verifying production data.');
    process.exit(0);
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('Import failed:', e && e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) main();

module.exports = { main };

#!/usr/bin/env node
// Simple API feed example (reads from Postgres and prints latest 20 items as JSON)

const { Client } = require('pg');

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set. Exiting.');
    process.exit(1);
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const res = await client.query('SELECT id, source_id, title, canonical_url, excerpt, published_at FROM items ORDER BY published_at DESC NULLS LAST LIMIT 20');
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });

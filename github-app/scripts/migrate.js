const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  try {
    const dir = path.join(__dirname, '..', 'sql');
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      process.stdout.write(`Applying ${file}\n`);
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

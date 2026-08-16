'use strict';

const assert = require('assert');
const { Pool } = require('pg');
const { PgPayCoreRevenueStore, syncPayCoreRevenue } = require('../paycore_revenue_bridge');

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('paycore revenue bridge pg test skipped: DATABASE_URL not set');
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TEMP TABLE payment_intents (
        id text PRIMARY KEY,
        sku text NOT NULL,
        product_name text NOT NULL,
        amount_minor bigint NOT NULL,
        currency char(3) NOT NULL,
        provider text,
        livemode boolean,
        succeeded_at timestamptz
      ) ON COMMIT PRESERVE ROWS
    `);
    await client.query(`
      CREATE TEMP TABLE paycore_kv (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      ) ON COMMIT PRESERVE ROWS
    `);

    await client.query(
      `INSERT INTO payment_intents (id, sku, product_name, amount_minor, currency, provider, livemode, succeeded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        'intent_pg_1',
        'RICH-199',
        'R.I.C.H.O. Improvement Pack',
        19900,
        'AUD',
        'stripe',
        true,
        '2026-08-15T00:10:00.000Z',
      ],
    );

    await client.query(
      `INSERT INTO payment_intents (id, sku, product_name, amount_minor, currency, provider, livemode, succeeded_at)
       VALUES ('intent_pg_test', 'RICH-TEST', 'Sandbox purchase', 100, 'AUD', 'stripe', false, now())`,
    );

    const captured = [];
    const store = new PgPayCoreRevenueStore(client);

    const first = await syncPayCoreRevenue({
      store,
      capture: async event => { captured.push(event); },
    });

    assert.deepStrictEqual(first, { scanned: 1, sent: 1, skipped: 0, invalid: 0, failed: 0 });
    assert.strictEqual(captured.length, 1);
    assert.strictEqual(captured[0].properties.revenue, 19900);
    assert.strictEqual(captured[0].properties.currency, 'AUD');

    const checkpoint = await client.query(
      `SELECT key, value FROM paycore_kv WHERE key = $1`,
      ['analytics:posthog:purchase:intent_pg_1'],
    );
    assert.strictEqual(checkpoint.rowCount, 1);
    assert.strictEqual(checkpoint.rows[0].value.event, 'richo_purchase_completed');
    assert.strictEqual(checkpoint.rows[0].value.revenue_minor, 19900);
    assert.strictEqual(checkpoint.rows[0].value.currency, 'AUD');

    const second = await syncPayCoreRevenue({
      store,
      capture: async event => { captured.push(event); },
    });
    assert.deepStrictEqual(second, { scanned: 1, sent: 0, skipped: 1, invalid: 0, failed: 0 });
    assert.strictEqual(captured.length, 1, 'PostgreSQL checkpoint must suppress duplicate analytics delivery');

    console.log('paycore revenue bridge pg integration test passed');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

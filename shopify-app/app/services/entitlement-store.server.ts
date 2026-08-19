import { Pool } from 'pg';
import { entitlementId, type EntitlementInput, type EntitlementRecord } from '../lib/entitlements.server';

let pool: Pool | null = null;
function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for entitlement persistence');
  pool ||= new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  return pool;
}

function map(row: any): EntitlementRecord {
  return {
    id: row.id,
    shop: row.shop,
    customerId: row.customer_id,
    orderId: row.order_id,
    sku: row.sku,
    kind: row.kind,
    resourceKey: row.resource_key,
    status: row.status,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function upsertEntitlement(input: EntitlementInput) {
  const id = entitlementId(input);
  const result = await db().query(
    `INSERT INTO richo_entitlements
      (id, shop, customer_id, order_id, sku, kind, resource_key, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (shop, customer_id, order_id, sku, resource_key)
     DO UPDATE SET status='active', expires_at=EXCLUDED.expires_at,
       revoked_at=NULL, revocation_reason=NULL, updated_at=now()
     RETURNING *`,
    [id, input.shop, input.customerId, input.orderId, input.sku, input.kind, input.resourceKey, input.expiresAt || null],
  );
  return map(result.rows[0]);
}

export async function listCustomerEntitlements(shop: string, customerId: string) {
  const result = await db().query(
    `SELECT * FROM richo_entitlements WHERE shop=$1 AND customer_id=$2 ORDER BY created_at DESC`,
    [shop, customerId],
  );
  return result.rows.map(map);
}

export async function revokeOrderEntitlements(input: { shop: string; orderId: string; reason: string }) {
  const result = await db().query(
    `UPDATE richo_entitlements
       SET status='revoked', revoked_at=now(), revocation_reason=$3, updated_at=now()
     WHERE shop=$1 AND order_id=$2 AND status='active'`,
    [input.shop, input.orderId, input.reason],
  );
  return result.rowCount || 0;
}

export async function getEntitlement(shop: string, id: string) {
  const result = await db().query(`SELECT * FROM richo_entitlements WHERE shop=$1 AND id=$2 LIMIT 1`, [shop, id]);
  return result.rows[0] ? map(result.rows[0]) : null;
}

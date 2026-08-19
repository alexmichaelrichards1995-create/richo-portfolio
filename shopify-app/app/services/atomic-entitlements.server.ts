import type { SqlClient } from './postgres-webhook-store.server';

export async function grantEntitlementsAtomic(db: SqlClient, input: {
  shopDomain: string;
  customerGid: string;
  orderGid: string;
  eventKey: string;
  entitlements: Array<{ key: string; sourceSku: string; kind: string; tier?: string | null }>;
}) {
  await db.query('BEGIN');
  try {
    const event = await db.query<{ id: number }>(
      `INSERT INTO customer_entitlement_events
       (shop_domain, customer_gid, order_gid, event_type, event_key, metadata)
       VALUES ($1,$2,$3,'grant',$4,$5::jsonb)
       ON CONFLICT (shop_domain, event_key) DO NOTHING
       RETURNING id`,
      [input.shopDomain, input.customerGid, input.orderGid, input.eventKey, JSON.stringify({ count: input.entitlements.length })],
    );
    if ((event.rowCount ?? event.rows.length) === 0) {
      await db.query('ROLLBACK');
      return { applied: false, reason: 'duplicate-event' as const };
    }

    for (const entitlement of input.entitlements) {
      await db.query(
        `INSERT INTO customer_entitlements
         (shop_domain, customer_gid, order_gid, entitlement_key, source_sku, kind, tier, status, granted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',now())
         ON CONFLICT (shop_domain, customer_gid, entitlement_key)
         DO UPDATE SET order_gid=EXCLUDED.order_gid, source_sku=EXCLUDED.source_sku,
           kind=EXCLUDED.kind, tier=EXCLUDED.tier, status='active', revoked_at=NULL`,
        [input.shopDomain, input.customerGid, input.orderGid, entitlement.key, entitlement.sourceSku, entitlement.kind, entitlement.tier ?? null],
      );
    }

    await db.query('COMMIT');
    return { applied: true as const };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export async function revokeOrderEntitlementsAtomic(db: SqlClient, input: {
  shopDomain: string;
  customerGid: string;
  orderGid: string;
  eventKey: string;
  reason: string;
}) {
  await db.query('BEGIN');
  try {
    const event = await db.query<{ id: number }>(
      `INSERT INTO customer_entitlement_events
       (shop_domain, customer_gid, order_gid, event_type, event_key, metadata)
       VALUES ($1,$2,$3,'revoke',$4,$5::jsonb)
       ON CONFLICT (shop_domain, event_key) DO NOTHING
       RETURNING id`,
      [input.shopDomain, input.customerGid, input.orderGid, input.eventKey, JSON.stringify({ reason: input.reason })],
    );
    if ((event.rowCount ?? event.rows.length) === 0) {
      await db.query('ROLLBACK');
      return { applied: false, reason: 'duplicate-event' as const };
    }

    await db.query(
      `UPDATE customer_entitlements
       SET status='revoked', revoked_at=now(), revoke_reason=$4
       WHERE shop_domain=$1 AND customer_gid=$2 AND order_gid=$3 AND status='active'`,
      [input.shopDomain, input.customerGid, input.orderGid, input.reason],
    );
    await db.query('COMMIT');
    return { applied: true as const };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

import type { SqlClient } from './postgres-webhook-store.server';

export type ProvisioningJob = {
  id: number;
  shop_domain: string;
  customer_gid: string;
  order_gid: string | null;
  action: 'grant' | 'revoke';
  payload: unknown;
  attempts: number;
};

export function createProvisioningJobStore(db: SqlClient) {
  return {
    async enqueue(input: { shopDomain: string; customerGid: string; orderGid?: string; action: 'grant' | 'revoke'; payload: unknown }) {
      await db.query(
        `INSERT INTO provisioning_jobs (shop_domain, customer_gid, order_gid, action, payload)
         VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT DO NOTHING`,
        [input.shopDomain, input.customerGid, input.orderGid ?? null, input.action, JSON.stringify(input.payload ?? {})],
      );
    },

    async lease(workerId: string, leaseSeconds = 60): Promise<ProvisioningJob | null> {
      const res = await db.query<ProvisioningJob>(
        `WITH candidate AS (
           SELECT id FROM provisioning_jobs
           WHERE status='queued'
             AND available_at <= now()
             AND (lease_expires_at IS NULL OR lease_expires_at < now())
           ORDER BY available_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE provisioning_jobs j
         SET status='leased', lease_owner=$1,
             lease_expires_at=now() + ($2 || ' seconds')::interval,
             heartbeat_at=now(), attempts=attempts+1, updated_at=now()
         FROM candidate
         WHERE j.id=candidate.id
         RETURNING j.id,j.shop_domain,j.customer_gid,j.order_gid,j.action,j.payload,j.attempts`,
        [workerId, leaseSeconds],
      );
      return res.rows[0] ?? null;
    },

    async heartbeat(jobId: number, workerId: string, leaseSeconds = 60) {
      await db.query(
        `UPDATE provisioning_jobs
         SET heartbeat_at=now(), lease_expires_at=now() + ($3 || ' seconds')::interval, updated_at=now()
         WHERE id=$1 AND lease_owner=$2 AND status='leased'`,
        [jobId, workerId, leaseSeconds],
      );
    },

    async complete(jobId: number, workerId: string) {
      await db.query(
        `UPDATE provisioning_jobs
         SET status='complete', lease_owner=NULL, lease_expires_at=NULL, updated_at=now()
         WHERE id=$1 AND lease_owner=$2`,
        [jobId, workerId],
      );
    },

    async retry(jobId: number, workerId: string, error: unknown, maxAttempts = 8) {
      const message = error instanceof Error ? error.message : String(error);
      await db.query(
        `UPDATE provisioning_jobs
         SET status=CASE WHEN attempts >= $3 THEN 'dead' ELSE 'queued' END,
             available_at=CASE WHEN attempts >= $3 THEN available_at ELSE now() + (LEAST(3600, POWER(2, attempts) * 15) || ' seconds')::interval END,
             lease_owner=NULL, lease_expires_at=NULL, last_error=$4, updated_at=now()
         WHERE id=$1 AND lease_owner=$2`,
        [jobId, workerId, maxAttempts, message.slice(0, 4000)],
      );
    },
  };
}

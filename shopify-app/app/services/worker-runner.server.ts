import { getDb } from './db.server';
import { createProvisioningJobStore } from './postgres-provisioning-jobs.server';
import { executeProvisionJob } from './provisioning-worker.server';

export async function runProvisioningCycle(workerId: string) {
  const db = getDb();
  const jobs = createProvisioningJobStore(db);
  const job = await jobs.lease(workerId);
  if (!job) return { processed: false as const };

  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const sku = String(payload.sku ?? payload.sourceSku ?? '');

  try {
    await executeProvisionJob({
      id: String(job.id),
      customerId: job.customer_gid,
      sku,
      kind: job.action,
      attempts: job.attempts,
    });
    await jobs.complete(job.id, workerId);
    return { processed: true as const, jobId: job.id };
  } catch (error) {
    await jobs.retry(job.id, workerId, error);
    throw error;
  }
}

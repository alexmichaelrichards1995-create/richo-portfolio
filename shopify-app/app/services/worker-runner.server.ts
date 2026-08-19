import { getDb } from './db.server';
import { leaseNextJob, markJobComplete, markJobFailed } from './postgres-provisioning-jobs.server';
import { executeProvisioningJob } from './provisioning-worker.server';

export async function runProvisioningCycle(workerId: string) {
  const db = getDb();
  const job = await leaseNextJob(db, workerId);
  if (!job) return { processed: false as const };

  try {
    await executeProvisioningJob(job);
    await markJobComplete(db, job.id, workerId);
    return { processed: true as const, jobId: job.id };
  } catch (error) {
    await markJobFailed(db, job.id, workerId, error);
    throw error;
  }
}

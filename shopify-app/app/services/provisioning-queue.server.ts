export type ProvisioningJob = {
  id: string;
  shop: string;
  customerId: string;
  orderId: string;
  entitlementId: string;
  action: 'grant' | 'revoke';
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError?: string;
};

export function backoffSeconds(attempt: number) {
  return Math.min(3600, Math.pow(2, Math.max(0, attempt - 1)) * 15);
}

export function nextJob(job: ProvisioningJob, error: unknown): ProvisioningJob {
  const attempts = job.attempts + 1;
  return {
    ...job,
    attempts,
    nextAttemptAt: new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString(),
    lastError: error instanceof Error ? error.message : String(error),
  };
}

export function isDeadLetter(job: ProvisioningJob) {
  return job.attempts >= job.maxAttempts;
}

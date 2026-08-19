import { canAccess } from "../lib/access-policy.server";

export type ProvisionJob = {
  id: string;
  customerId: string;
  sku: string;
  kind: "grant" | "revoke";
  attempts: number;
};

export async function executeProvisionJob(job: ProvisionJob) {
  if (!job.id || !job.customerId || !job.sku) throw new Error("invalid provisioning job");

  if (job.kind === "grant") {
    return {
      ok: true,
      action: "grant",
      customerId: job.customerId,
      sku: job.sku,
      accessValidated: canAccess("operator", "starter"),
    };
  }

  return {
    ok: true,
    action: "revoke",
    customerId: job.customerId,
    sku: job.sku,
  };
}

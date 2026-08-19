import { evaluateProductionReadiness } from "./production-readiness.server";

export type DeploymentState = "BLOCKED" | "QUALIFIED" | "APPROVED";

export function deploymentState(env: NodeJS.ProcessEnv = process.env): { state: DeploymentState; reasons: string[] } {
  const readiness = evaluateProductionReadiness(env);
  if (!readiness.ready) return { state: "BLOCKED", reasons: readiness.blockers };
  if (env.RICHO_DEPLOYMENT_APPROVED !== "true") {
    return { state: "QUALIFIED", reasons: ["Technical gates passed; explicit deployment approval is still required."] };
  }
  return { state: "APPROVED", reasons: [] };
}

export type OperatorCapability = "approve" | "execute" | "rollback";

function parseSet(value: string | undefined) {
  return new Set((value ?? "").split(",").map((v) => v.trim()).filter(Boolean));
}

export function operatorCapabilities(sessionId: string, env: NodeJS.ProcessEnv = process.env): Set<OperatorCapability> {
  const approvers = parseSet(env.RICHO_APPROVER_SESSION_IDS);
  const executors = parseSet(env.RICHO_EXECUTOR_SESSION_IDS);
  const rollbackOperators = parseSet(env.RICHO_ROLLBACK_SESSION_IDS);
  const capabilities = new Set<OperatorCapability>();
  if (approvers.has(sessionId)) capabilities.add("approve");
  if (executors.has(sessionId)) capabilities.add("execute");
  if (rollbackOperators.has(sessionId)) capabilities.add("rollback");
  return capabilities;
}

export function requireOperatorCapability(
  sessionId: string,
  capability: OperatorCapability,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.NODE_ENV !== "production" && env.RICHO_ENFORCE_OPERATOR_POLICY !== "true") return;
  if (!operatorCapabilities(sessionId, env).has(capability)) {
    throw new Response(`RICHO_OPERATOR_FORBIDDEN:${capability}`, { status: 403 });
  }
}

import prisma from "../db.server";
import { upsertOperator } from "./operator-store.server";

const DEFAULT_MUTATIONS_PER_MINUTE = 6;

function minuteBucket(date = new Date()) {
  const bucket = new Date(date);
  bucket.setUTCSeconds(0, 0);
  return bucket;
}

export async function bootstrapAccountOwnerOperator(shopDomain: string, sessionId: string) {
  const existing = await prisma.richoShopOperator.findUnique({
    where: { shopDomain_sessionId: { shopDomain, sessionId } },
  });
  if (existing) return existing;

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.shop !== shopDomain || !session.accountOwner) return null;

  return upsertOperator({
    shopDomain,
    sessionId,
    canApprove: true,
    canExecute: true,
    canRollback: true,
    canAdminister: true,
    active: true,
  });
}

export async function consumeMutationQuota(args: {
  shopDomain: string;
  actorId: string;
  limit?: number;
  now?: Date;
}) {
  const limit = args.limit ?? Number(process.env.RICHO_MUTATIONS_PER_MINUTE || DEFAULT_MUTATIONS_PER_MINUTE);
  if (!Number.isInteger(limit) || limit < 1 || limit > 60) throw new Error("RICHO_INVALID_MUTATION_LIMIT");
  const windowStart = minuteBucket(args.now);
  const row = await prisma.richoMutationWindow.upsert({
    where: { shopDomain_actorId_windowStart: { shopDomain: args.shopDomain, actorId: args.actorId, windowStart } },
    create: { shopDomain: args.shopDomain, actorId: args.actorId, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (row.count > limit) {
    throw new Response("Mutation rate limit exceeded", {
      status: 429,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }
  return { count: row.count, limit, windowStart };
}

export async function revokeShopSessions(shopDomain: string, actorId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.session.deleteMany({ where: { shop: shopDomain } });
    const control = await tx.richoShopControl.upsert({
      where: { shopDomain },
      create: { shopDomain, deploymentState: "BLOCKED", deploymentApproved: false, sessionsRevokedAt: now },
      update: { deploymentState: "BLOCKED", deploymentApproved: false, sessionsRevokedAt: now },
    });
    return { deletedSessions: deleted.count, revokedAt: now, actorId, control };
  });
}

export async function getInstallationQualification(shopDomain: string) {
  const [control, operators, sessions, latestWebhook] = await Promise.all([
    prisma.richoShopControl.findUnique({ where: { shopDomain } }),
    prisma.richoShopOperator.findMany({ where: { shopDomain, active: true } }),
    prisma.session.findMany({ where: { shop: shopDomain }, select: { id: true, scope: true, expires: true } }),
    prisma.richoWebhookReceipt.findFirst({ where: { shopDomain }, orderBy: { processedAt: "desc" } }),
  ]);

  const requiredScopes = ["read_products", "write_products", "read_orders", "read_customers", "read_reports"];
  const granted = new Set((sessions[0]?.scope ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const missingScopes = requiredScopes.filter((scope) => !granted.has(scope));
  const hasApprover = operators.some((o) => o.canApprove);
  const hasExecutor = operators.some((o) => o.canExecute);
  const hasRollback = operators.some((o) => o.canRollback);
  const hasAdministrator = operators.some((o) => o.canAdminister);
  const checks = [
    { id: "session", label: "Authenticated Shopify session", ok: sessions.length > 0 },
    { id: "scopes", label: "Required Shopify scopes", ok: missingScopes.length === 0, detail: missingScopes.length ? `Missing: ${missingScopes.join(", ")}` : "All required scopes present" },
    { id: "approver", label: "Active approver", ok: hasApprover },
    { id: "executor", label: "Active executor", ok: hasExecutor },
    { id: "rollback", label: "Active rollback operator", ok: hasRollback },
    { id: "administrator", label: "Active security administrator", ok: hasAdministrator },
    { id: "webhook", label: "Webhook channel observed", ok: Boolean(latestWebhook), detail: latestWebhook ? latestWebhook.processedAt.toISOString() : "No webhook receipt recorded yet" },
    { id: "deployment", label: "Explicit deployment approval", ok: control?.deploymentApproved === true },
  ];
  const technicalChecks = checks.filter((c) => c.id !== "deployment");
  const technicallyReady = technicalChecks.every((c) => c.ok);
  const state = !technicallyReady ? "BLOCKED" : control?.deploymentApproved ? "APPROVED" : "QUALIFIED";
  return { state, checks, control, operators, sessionCount: sessions.length, latestWebhook };
}

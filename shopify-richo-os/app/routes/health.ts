import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { evaluateProductionReadiness } from "../lib/production-readiness.server";

export async function loader(_args: LoaderFunctionArgs) {
  const readiness = evaluateProductionReadiness();
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  const healthy = database && (process.env.NODE_ENV !== "production" || readiness.ready);
  return Response.json({
    status: healthy ? "ok" : "degraded",
    database,
    productionReady: readiness.ready,
    blockerCount: readiness.blockers.length,
    timestamp: new Date().toISOString(),
  }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

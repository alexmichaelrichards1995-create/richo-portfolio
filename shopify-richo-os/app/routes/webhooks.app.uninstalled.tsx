import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { emitTelemetry } from "../lib/telemetry.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  emitTelemetry("warn", "shopify.webhook.app_uninstalled", { shop, topic });
  if (session) await prisma.session.deleteMany({ where: { shop } });
  return new Response();
};

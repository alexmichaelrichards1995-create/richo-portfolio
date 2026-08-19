import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { emitTelemetry } from "../lib/telemetry.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  const current = payload.current as string[];
  emitTelemetry("info", "shopify.webhook.scopes_update", { shop, topic, scopes: current });
  if (session) {
    await prisma.session.update({ where: { id: session.id }, data: { scope: current.toString() } });
  }
  return new Response();
};

import { describe, expect, it } from "vitest";
import { webhookIdFromRequest } from "./webhook-security.server";

describe("webhook security", () => {
  it("extracts Shopify webhook id", () => {
    const request = new Request("https://example.test/webhook", {
      headers: { "X-Shopify-Webhook-Id": "wh_123" },
    });
    expect(webhookIdFromRequest(request)).toBe("wh_123");
  });

  it("rejects absence by returning an empty id", () => {
    const request = new Request("https://example.test/webhook");
    expect(webhookIdFromRequest(request)).toBe("");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { assertTrustedAdminPost } from "./admin-request-guard.server";

const originalUrl = process.env.SHOPIFY_APP_URL;
afterEach(() => { process.env.SHOPIFY_APP_URL = originalUrl; });

describe("assertTrustedAdminPost", () => {
  it("allows same-origin POST", () => {
    process.env.SHOPIFY_APP_URL = "https://app.example.com";
    const request = new Request("https://app.example.com/app/security", { method: "POST", headers: { origin: "https://app.example.com", "sec-fetch-site": "same-origin" } });
    expect(() => assertTrustedAdminPost(request)).not.toThrow();
  });

  it("blocks foreign origins", () => {
    process.env.SHOPIFY_APP_URL = "https://app.example.com";
    const request = new Request("https://app.example.com/app/security", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
    expect(() => assertTrustedAdminPost(request)).toThrow();
  });

  it("blocks non-POST methods", () => {
    process.env.SHOPIFY_APP_URL = "https://app.example.com";
    expect(() => assertTrustedAdminPost(new Request("https://app.example.com/app/security"))).toThrow();
  });
});

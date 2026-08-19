import { describe, expect, it } from "vitest";
import { resilientAdminGraphql } from "./shopify-retry.server";

const response = (status: number) => new Response(JSON.stringify({ ok: status < 400 }), { status });

describe("Shopify GraphQL retry", () => {
  it("returns successful responses immediately", async () => {
    let calls = 0;
    const wrapped = resilientAdminGraphql(async () => { calls++; return response(200); }, { maxAttempts: 3, baseDelayMs: 0 });
    expect((await wrapped("query {}" )).status).toBe(200);
    expect(calls).toBe(1);
  });

  it("retries 429 and succeeds", async () => {
    let calls = 0;
    const wrapped = resilientAdminGraphql(async () => { calls++; return response(calls === 1 ? 429 : 200); }, { maxAttempts: 3, baseDelayMs: 0 });
    expect((await wrapped("query {}" )).status).toBe(200);
    expect(calls).toBe(2);
  });

  it("retries 5xx and succeeds", async () => {
    let calls = 0;
    const wrapped = resilientAdminGraphql(async () => { calls++; return response(calls < 3 ? 503 : 200); }, { maxAttempts: 3, baseDelayMs: 0 });
    expect((await wrapped("query {}" )).status).toBe(200);
    expect(calls).toBe(3);
  });

  it("retries transient thrown errors and succeeds", async () => {
    let calls = 0;
    const wrapped = resilientAdminGraphql(async () => { calls++; if (calls === 1) throw new Error("network"); return response(200); }, { maxAttempts: 2, baseDelayMs: 0 });
    expect((await wrapped("query {}" )).status).toBe(200);
    expect(calls).toBe(2);
  });

  it("does not retry normal 4xx responses", async () => {
    let calls = 0;
    const wrapped = resilientAdminGraphql(async () => { calls++; return response(400); }, { maxAttempts: 4, baseDelayMs: 0 });
    expect((await wrapped("query {}" )).status).toBe(400);
    expect(calls).toBe(1);
  });

  it("throws after retry exhaustion", async () => {
    let calls = 0;
    const wrapped = resilientAdminGraphql(async () => { calls++; return response(503); }, { maxAttempts: 3, baseDelayMs: 0 });
    await expect(wrapped("query {}" )).rejects.toThrow("RICHO_SHOPIFY_HTTP_503");
    expect(calls).toBe(3);
  });
});

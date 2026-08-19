import test from "node:test";
import assert from "node:assert/strict";
import { assertRuntimeEnv } from "../app/lib/runtime-guards.server";

test("runtime env passes when required values exist", () => {
  assert.equal(assertRuntimeEnv({
    SHOPIFY_API_KEY: "key",
    SHOPIFY_API_SECRET: "secret",
    SHOPIFY_APP_URL: "https://example.com",
    RICHO_DOWNLOAD_SECRET: "download-secret",
  } as NodeJS.ProcessEnv), true);
});

test("runtime env fails closed when required values are absent", () => {
  assert.throws(() => assertRuntimeEnv({} as NodeJS.ProcessEnv), /Missing required runtime configuration/);
});

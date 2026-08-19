import test from "node:test";
import assert from "node:assert/strict";
import { once } from "../app/lib/webhook-store.server";

const receipt = { id: "delivery-1", topic: "ORDERS_PAID", shop: "richo.myshopify.com", processedAt: new Date().toISOString() };

test("webhook work executes only once per delivery id", async () => {
  let calls = 0;
  const first = await once(receipt, async () => ++calls);
  const second = await once(receipt, async () => ++calls);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(calls, 1);
});

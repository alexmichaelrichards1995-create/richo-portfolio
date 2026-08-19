import { describe, expect, it } from "vitest";
import { hashState, stableJson } from "./state-hash.server";

describe("deterministic state hashing", () => {
  it("is independent of object key order", () => {
    const a = { id: "1", seo: { title: "A", description: "B" }, count: 2 };
    const b = { count: 2, seo: { description: "B", title: "A" }, id: "1" };
    expect(stableJson(a)).toBe(stableJson(b));
    expect(hashState(a)).toBe(hashState(b));
  });

  it("changes when protected state changes", () => {
    expect(hashState({ title: "A" })).not.toBe(hashState({ title: "B" }));
  });

  it("drops undefined values consistently", () => {
    expect(stableJson({ a: 1, b: undefined })).toBe(stableJson({ a: 1 }));
  });

  it("preserves array order", () => {
    expect(hashState([1, 2, 3])).not.toBe(hashState([3, 2, 1]));
  });
});

import { describe, expect, it } from "vitest";
import { assertRequiredBound, unboundRequiredSlots } from "../bindings.js";

const slots = [
  { key: "card", kind: "account" as const, label: "Card", required: true },
  { key: "general", kind: "category" as const, label: "General", required: true },
  { key: "trip", kind: "group" as const, label: "Trip", required: false }
];

describe("unboundRequiredSlots", () => {
  it("lists only required slots without a binding", () => {
    expect(unboundRequiredSlots(slots, { card: "a" })).toEqual(["general"]);
    expect(unboundRequiredSlots(slots, { card: "a", general: "c" })).toEqual([]);
  });
});

describe("assertRequiredBound", () => {
  it("reports missing required slots with 400 and their keys", () => {
    expect(() => assertRequiredBound(slots, { card: "a" })).toThrow(
      expect.objectContaining({ statusCode: 400, message: "Required slots are not bound: general", details: { unboundSlots: ["general"] } })
    );
    expect(() => assertRequiredBound(slots, { card: "a", general: "c" })).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { undeclaredBindingKeys, unboundRequiredSlots } from "../bindings.js";

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

describe("undeclaredBindingKeys", () => {
  it("lists bindings whose key is not a slot", () => {
    expect(undeclaredBindingKeys(slots, { card: "a", ghost: "x" })).toEqual(["ghost"]);
  });
});

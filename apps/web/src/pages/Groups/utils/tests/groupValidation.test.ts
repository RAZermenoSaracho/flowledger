import { describe, expect, it } from "vitest";
import { validateGroupDraft } from "../groupValidation";

describe("validateGroupDraft", () => {
  it("accepts a named group with an empty description", () => {
    expect(validateGroupDraft({ name: "Home", description: "" })).toEqual({});
  });

  it("flags a blank name", () => {
    expect(validateGroupDraft({ name: "  ", description: "" }).name).toBeTruthy();
  });

  it("flags an over-long description", () => {
    expect(
      validateGroupDraft({ name: "Home", description: "x".repeat(501) }).description
    ).toBeTruthy();
  });
});

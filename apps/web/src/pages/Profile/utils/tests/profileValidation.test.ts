import { describe, expect, it } from "vitest";
import { validateProfile } from "../profileValidation";

const ok = { name: "Jane", email: "jane@example.com", preferredCurrency: "", avatarFile: null };

describe("validateProfile", () => {
  it("accepts a valid draft", () => {
    expect(validateProfile(ok)).toEqual({});
  });

  it("rejects a blank name and a malformed email", () => {
    expect(validateProfile({ ...ok, name: "  ", email: "nope" })).toEqual({
      name: "Name is required",
      email: "Enter a valid email address"
    });
  });
});

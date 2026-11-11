import { describe, expect, it } from "vitest";
import type { ProfileDraft } from "../../types/profile.types";
import { validateProfile } from "../profileValidation";

const ok: ProfileDraft = {
  name: "Jane",
  email: "jane@example.com",
  username: "jane",
  identityVisibility: "username_only",
  preferredCurrency: "",
  avatarFile: null
};

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

  it("rejects a username that breaks the shared rules", () => {
    expect(validateProfile({ ...ok, username: "ab" }).username).toBeDefined();
    expect(validateProfile({ ...ok, username: "admin" }).username).toBe("This username is reserved");
    expect(validateProfile({ ...ok, username: ".bob" }).username).toBeDefined();
  });

  it("normalizes case and flags a username reported as taken", () => {
    expect(validateProfile({ ...ok, username: " Jane2 " }, "jane2").username).toBe("That username is taken");
    expect(validateProfile({ ...ok, username: "jane3" }, "jane2")).toEqual({});
  });
});

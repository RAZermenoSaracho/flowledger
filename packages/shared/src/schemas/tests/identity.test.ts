import { describe, expect, it } from "vitest";
import {
  blockUserSchema,
  identityVisibilitySchema,
  shareAcceptanceSchema,
  usernameAvailabilityQuerySchema,
  usernameSchema
} from "../identity.js";
import { updateUserProfileSchema } from "../auth.js";

describe("usernameSchema", () => {
  it.each(["ana", "ana_1", "a.b-c".replace("-", "_"), "user_ab12cd34ef56", "a1b"])("accepts %s", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(true);
  });

  it("normalizes case and surrounding whitespace to the stored form", () => {
    expect(usernameSchema.parse("  Ana.Smith ")).toBe("ana.smith");
  });

  it.each(["ab", ".ana", "ana.", "_ana", "ana_", "a..b", "a b", "ana-1", "a".repeat(31), "ñandú"])(
    "rejects %s",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    }
  );

  it.each(["admin", "Support", "FlowLedger", "api", "root", "me", "settings", "help", "system", "null", "undefined"])(
    "rejects reserved %s",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    }
  );
});

describe("identity schemas", () => {
  it("validates visibility and acceptance values", () => {
    expect(identityVisibilitySchema.safeParse("username_and_name").success).toBe(true);
    expect(identityVisibilitySchema.safeParse("everyone").success).toBe(false);
    expect(shareAcceptanceSchema.safeParse("proposed").success).toBe(true);
    expect(shareAcceptanceSchema.safeParse("paid").success).toBe(false);
  });

  it("normalizes the availability query username", () => {
    expect(usernameAvailabilityQuerySchema.parse({ username: "Ana" })).toEqual({ username: "ana" });
    expect(usernameAvailabilityQuerySchema.safeParse({ username: "a" }).success).toBe(false);
  });

  it("requires a userId to block", () => {
    expect(blockUserSchema.safeParse({ userId: "u1" }).success).toBe(true);
    expect(blockUserSchema.safeParse({ userId: "" }).success).toBe(false);
  });

  it("accepts username and visibility on the profile update", () => {
    const base = { name: "A", email: "a@x.com" };
    expect(
      updateUserProfileSchema.parse({ ...base, username: "Ana", identityVisibility: "username_and_name" })
    ).toMatchObject({ username: "ana", identityVisibility: "username_and_name" });
    expect(updateUserProfileSchema.safeParse({ ...base, username: "admin" }).success).toBe(false);
  });
});

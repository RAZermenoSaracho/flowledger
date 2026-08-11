import { describe, expect, it } from "vitest";
import {
  googleOAuthCallbackQuerySchema,
  googleOAuthStartQuerySchema,
  loginSchema,
  registerSchema,
  updateUserPasswordSchema,
  updateUserPlanSchema,
  updateUserProfileSchema,
  updateUserSidebarSideSchema,
  userSearchQuerySchema
} from "../auth.js";

describe("registerSchema", () => {
  const valid = { name: "Ada", email: "ada@example.com", password: "longenough" };

  it("accepts valid registration input", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(
      registerSchema.safeParse({ ...valid, email: "not-an-email" }).success
    ).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(registerSchema.safeParse({ ...valid, password: "short" }).success).toBe(
      false
    );
  });
});

describe("loginSchema", () => {
  it("accepts valid login input", () => {
    expect(
      loginSchema.safeParse({ email: "ada@example.com", password: "x" }).success
    ).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(
      loginSchema.safeParse({ email: "ada@example.com", password: "" }).success
    ).toBe(false);
  });
});

describe("googleOAuthStartQuerySchema", () => {
  it("defaults redirect to '/'", () => {
    expect(googleOAuthStartQuerySchema.parse({})).toEqual({ redirect: "/" });
  });

  it("accepts an app-relative path", () => {
    expect(
      googleOAuthStartQuerySchema.safeParse({ redirect: "/dashboard" }).success
    ).toBe(true);
  });

  it("rejects a protocol-relative redirect (open redirect risk)", () => {
    expect(
      googleOAuthStartQuerySchema.safeParse({ redirect: "//evil.example.com" })
        .success
    ).toBe(false);
  });

  it("rejects an absolute external URL", () => {
    expect(
      googleOAuthStartQuerySchema.safeParse({ redirect: "https://evil.example.com" })
        .success
    ).toBe(false);
  });
});

describe("googleOAuthCallbackQuerySchema", () => {
  it("accepts a callback with a code and state", () => {
    expect(
      googleOAuthCallbackQuerySchema.safeParse({ code: "abc", state: "xyz" })
        .success
    ).toBe(true);
  });

  it("accepts a callback with an error and state (no code)", () => {
    expect(
      googleOAuthCallbackQuerySchema.safeParse({ error: "access_denied", state: "xyz" })
        .success
    ).toBe(true);
  });

  it("rejects a callback missing both code and error", () => {
    expect(
      googleOAuthCallbackQuerySchema.safeParse({ state: "xyz" }).success
    ).toBe(false);
  });

  it("rejects a callback missing state", () => {
    expect(
      googleOAuthCallbackQuerySchema.safeParse({ code: "abc" }).success
    ).toBe(false);
  });
});

describe("updateUserProfileSchema", () => {
  it("accepts a valid profile update", () => {
    expect(
      updateUserProfileSchema.safeParse({
        name: "Ada",
        email: "ada@example.com"
      }).success
    ).toBe(true);
  });

  it("accepts a null preferredCurrency", () => {
    expect(
      updateUserProfileSchema.safeParse({
        name: "Ada",
        email: "ada@example.com",
        preferredCurrency: null
      }).success
    ).toBe(true);
  });
});

describe("updateUserPasswordSchema", () => {
  it("accepts matching new/confirm passwords", () => {
    expect(
      updateUserPasswordSchema.safeParse({
        currentPassword: "current1",
        newPassword: "newpassword",
        confirmPassword: "newpassword"
      }).success
    ).toBe(true);
  });

  it("rejects mismatched new/confirm passwords", () => {
    const result = updateUserPasswordSchema.safeParse({
      currentPassword: "current1",
      newPassword: "newpassword",
      confirmPassword: "different"
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });
});

describe("updateUserPlanSchema", () => {
  it("accepts a known plan type", () => {
    expect(updateUserPlanSchema.safeParse({ planType: "free" }).success).toBe(
      true
    );
  });

  it("rejects an unknown plan type", () => {
    expect(
      updateUserPlanSchema.safeParse({ planType: "enterprise" }).success
    ).toBe(false);
  });
});

describe("updateUserSidebarSideSchema", () => {
  it("accepts 'left' and 'right'", () => {
    expect(
      updateUserSidebarSideSchema.safeParse({ mobileSidebarSide: "left" })
        .success
    ).toBe(true);
    expect(
      updateUserSidebarSideSchema.safeParse({ mobileSidebarSide: "right" })
        .success
    ).toBe(true);
  });

  it("rejects any other value", () => {
    expect(
      updateUserSidebarSideSchema.safeParse({ mobileSidebarSide: "top" })
        .success
    ).toBe(false);
  });
});

describe("userSearchQuerySchema", () => {
  it("defaults limit to 10", () => {
    expect(userSearchQuerySchema.parse({ q: "ada" })).toEqual({
      q: "ada",
      limit: 10
    });
  });

  it("rejects an empty query", () => {
    expect(userSearchQuerySchema.safeParse({ q: "" }).success).toBe(false);
  });

  it("rejects a limit above 25", () => {
    expect(
      userSearchQuerySchema.safeParse({ q: "ada", limit: "26" }).success
    ).toBe(false);
  });
});

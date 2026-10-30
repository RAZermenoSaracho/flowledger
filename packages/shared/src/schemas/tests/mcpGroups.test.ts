import { describe, expect, it } from "vitest";
import {
  addGroupMemberToolSchema,
  apiUserSearchQuerySchema,
  createGroupCategoryToolSchema,
  searchUsersToolSchema
} from "../mcpGroups.js";

describe("apiUserSearchQuerySchema", () => {
  it("requires 3+ characters and defaults the limit to 10", () => {
    expect(apiUserSearchQuerySchema.parse({ q: " ali " })).toEqual({ q: "ali", limit: 10 });
    expect(apiUserSearchQuerySchema.safeParse({ q: "al" }).success).toBe(false);
    expect(apiUserSearchQuerySchema.safeParse({ q: "  a " }).success).toBe(false);
  });

  it("coerces the limit and caps it at 10", () => {
    expect(apiUserSearchQuerySchema.parse({ q: "ali", limit: "5" }).limit).toBe(5);
    expect(apiUserSearchQuerySchema.safeParse({ q: "ali", limit: "11" }).success).toBe(false);
  });
});

describe("group tool schemas", () => {
  it("rejects unknown keys", () => {
    expect(searchUsersToolSchema.safeParse({ q: "ali", extra: 1 }).success).toBe(false);
    expect(addGroupMemberToolSchema.safeParse({ groupId: "g", userId: "u", role: "admin" }).success).toBe(false);
    expect(createGroupCategoryToolSchema.safeParse({ groupId: "g", name: "x", type: "expense", extra: 1 }).success).toBe(false);
  });

  it("accepts valid input", () => {
    expect(addGroupMemberToolSchema.parse({ groupId: "g", userId: "u" })).toEqual({ groupId: "g", userId: "u" });
    expect(createGroupCategoryToolSchema.parse({ groupId: "g", name: "Food", type: "expense" }).name).toBe("Food");
  });
});

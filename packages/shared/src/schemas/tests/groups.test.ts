import { describe, expect, it } from "vitest";
import {
  groupCategorySchema,
  groupMemberSchema,
  groupSchema,
  groupsQueryParamSchema,
  updateGroupSchema
} from "../groups.js";

describe("groupSchema", () => {
  it("accepts a valid group", () => {
    expect(groupSchema.safeParse({ name: "Roommates" }).success).toBe(true);
  });

  it("accepts a null description", () => {
    expect(
      groupSchema.safeParse({ name: "Roommates", description: null }).success
    ).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(groupSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("updateGroupSchema", () => {
  it("accepts a single-field update", () => {
    expect(updateGroupSchema.safeParse({ name: "Renamed" }).success).toBe(
      true
    );
  });

  it("rejects an empty object", () => {
    expect(updateGroupSchema.safeParse({}).success).toBe(false);
  });
});

describe("groupsQueryParamSchema", () => {
  it("accepts an empty object", () => {
    expect(groupsQueryParamSchema.safeParse({}).success).toBe(true);
  });
});

describe("groupMemberSchema", () => {
  it("accepts a valid userId", () => {
    expect(groupMemberSchema.safeParse({ userId: "user-1" }).success).toBe(
      true
    );
  });

  it("rejects an empty userId", () => {
    expect(groupMemberSchema.safeParse({ userId: "" }).success).toBe(false);
  });
});

describe("groupCategorySchema", () => {
  it("accepts the same shape as categorySchema", () => {
    expect(
      groupCategorySchema.safeParse({ name: "Rent", type: "expense" }).success
    ).toBe(true);
  });
});

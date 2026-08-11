import { describe, expect, it } from "vitest";
import { groupInclude, groupListInclude } from "../groupInclude.js";

describe("groupInclude", () => {
  it("scopes categories to the given user's access and active status", () => {
    const include = groupInclude("user-1");

    expect(include.categories.where).toEqual({
      users: { some: { userId: "user-1" } },
      isArchived: false
    });
  });

  it("loads members with their user relation, ordered by createdAt", () => {
    const include = groupInclude("user-1");

    expect(include.members).toEqual({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" }
    });
  });
});

describe("groupListInclude", () => {
  it("uses datasieve's where/sort shape, not raw Prisma clauses", () => {
    const include = groupListInclude();

    expect(include.categories.where).toEqual({
      field: "isArchived",
      op: "=",
      value: false
    });
    expect(include.members.sort).toEqual([
      { field: "createdAt", direction: "asc" }
    ]);
  });

  it("still nests the user relation under members (no bare members: true)", () => {
    const include = groupListInclude();

    expect(include.members.include).toEqual({
      user: { select: { id: true, name: true, email: true } }
    });
  });
});

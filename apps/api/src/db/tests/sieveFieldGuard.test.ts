import { describe, expect, it } from "vitest";
import {
  assertAllowedQueryFields,
  assertSafeQueryFields,
  queryFieldPaths
} from "../sieveFieldGuard.js";

describe("queryFieldPaths", () => {
  it("finds fields in nested conditions, sorts and groupings, but not in values", () => {
    const query = {
      where: {
        and: [
          { field: "name", op: "=", value: { field: "not-a-path" } },
          { or: [{ field: "category.name", op: "=", value: "x" }] }
        ]
      },
      sort: [{ field: "date", direction: "desc" }],
      groupBy: { fields: ["type"] }
    };

    expect(queryFieldPaths(query)).toEqual(["name", "category.name", "date", "type"]);
  });
});

describe("assertSafeQueryFields", () => {
  it.each([
    "owner.passwordHash",
    "owner.email",
    "group.owner.passwordHash",
    "transaction.user.email",
    "passwordHash",
    "tokenHash",
    "users.userId"
  ])("rejects %s with a 400", (field) => {
    expect(() =>
      assertSafeQueryFields({ where: { or: [{ field, op: "ilike", value: "$2" }] } })
    ).toThrowError(expect.objectContaining({ statusCode: 400 }));
  });

  it("rejects a blocked path in a sort", () => {
    expect(() =>
      assertSafeQueryFields({ sort: [{ field: "owner.passwordHash", direction: "asc" }] })
    ).toThrowError(expect.objectContaining({ statusCode: 400 }));
  });

  it("passes ordinary and own-record relation fields", () => {
    expect(() =>
      assertSafeQueryFields({
        where: {
          and: [
            { field: "userId", op: "=", value: "u1" },
            { field: "category.name", op: "=", value: "x" },
            { field: "providerAccount.accountId", op: "=", value: "a1" }
          ]
        }
      })
    ).not.toThrow();
  });
});

describe("assertAllowedQueryFields", () => {
  const allowed = new Set(["title", "status"]);

  it("passes listed fields and rejects anything else", () => {
    expect(() => assertAllowedQueryFields({ field: "title" }, allowed)).not.toThrow();
    expect(() => assertAllowedQueryFields({ field: "transaction.notes" }, allowed)).toThrowError(
      expect.objectContaining({ statusCode: 400 })
    );
  });
});

import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import {
  assertCategory,
  getGroupAdmin,
  getGroupById,
  getGroupMembership,
  listGroups
} from "../read.service.js";

/**
 * `transaction.groupBy` is Prisma's most heavily overloaded generic method —
 * `vitest-mock-extended`'s typing can't express `.mockResolvedValue(...)` on
 * it directly, so this narrows it to a plain mock-like shape for test use.
 */
interface GroupByMock {
  mockResolvedValue: (value: unknown) => GroupByMock;
  mockResolvedValueOnce: (value: unknown) => GroupByMock;
}
const groupByMock = prismaMock.transaction.groupBy as unknown as GroupByMock;

describe("getGroupMembership", () => {
  it("returns null when no groupId is given", async () => {
    expect(await getGroupMembership("user-1", undefined)).toBeNull();
    expect(await getGroupMembership("user-1", null)).toBeNull();
  });

  it("returns the membership row when found", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue({
      id: "member-1"
    } as never);
    expect(await getGroupMembership("user-1", "group-1")).toMatchObject({
      id: "member-1"
    });
  });

  it("throws a 400 when the user isn't a member", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue(null);
    await expect(getGroupMembership("user-1", "group-1")).rejects.toThrow(
      "Group does not exist for this user"
    );
  });
});

describe("getGroupAdmin", () => {
  it("returns the admin membership row", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue({
      id: "member-1",
      role: "admin"
    } as never);
    expect(await getGroupAdmin("user-1", "group-1")).toMatchObject({
      id: "member-1"
    });
  });

  it("throws a 404 (not 403, to avoid leaking existence) when not an admin", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue(null);
    await expect(getGroupAdmin("user-1", "group-1")).rejects.toThrow(
      "Group not found"
    );
  });
});

describe("assertCategory", () => {
  it("returns null when no categoryId is given", async () => {
    expect(await assertCategory("user-1", "group-1", undefined)).toBeNull();
  });

  it("throws a 400 when categoryId is given without a groupId", async () => {
    await expect(
      assertCategory("user-1", undefined, "cat-1")
    ).rejects.toThrow("Group category requires a group");
  });

  it("throws when the user isn't a group member", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue(null);
    await expect(
      assertCategory("user-1", "group-1", "cat-1")
    ).rejects.toThrow("Group does not exist for this user");
  });

  it("returns the category when it's active and accessible", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue({ id: "m1" } as never);
    prismaMock.category.findFirst.mockResolvedValue({ id: "cat-1" } as never);

    expect(await assertCategory("user-1", "group-1", "cat-1")).toMatchObject({
      id: "cat-1"
    });
  });

  it("throws a 400 when the category doesn't exist or is archived", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue({ id: "m1" } as never);
    prismaMock.category.findFirst.mockResolvedValue(null);

    await expect(
      assertCategory("user-1", "group-1", "cat-1")
    ).rejects.toThrow("Group category does not exist or is archived");
  });
});

describe("listGroups", () => {
  it("scopes to groups the user is a member of", async () => {
    prismaMock.group.findMany.mockResolvedValue([{ id: "group-1" }] as never);

    await listGroups("user-1", undefined);

    expect(prismaMock.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { members: { some: { userId: "user-1" } } }
      })
    );
  });

  it("rejects an invalid query param", async () => {
    await expect(listGroups("user-1", "not json")).rejects.toThrow(
      "Invalid groups query: not valid JSON"
    );
  });
});

describe("getGroupById", () => {
  it("throws when the user isn't a member", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue(null);
    await expect(getGroupById("user-1", "group-1")).rejects.toThrow(
      "Group does not exist for this user"
    );
  });

  it("throws a 404 when the group doesn't exist", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue({ id: "m1" } as never);
    prismaMock.group.findUnique.mockResolvedValue(null);
    groupByMock.mockResolvedValue([] as never);

    await expect(getGroupById("user-1", "group-1")).rejects.toThrow(
      "Group not found"
    );
  });

  it("computes income/expense/balance summary from grouped transaction totals", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue({ id: "m1" } as never);
    prismaMock.group.findUnique.mockResolvedValue({ id: "group-1" } as never);
    groupByMock.mockResolvedValue([
      { type: "income", _sum: { amount: { toNumber: () => 1000 } } },
      { type: "expense", _sum: { amount: { toNumber: () => 400 } } }
    ] as never);

    const result = await getGroupById("user-1", "group-1");

    expect(result.summary).toEqual({
      totalIncome: 1000,
      totalExpenses: 400,
      balance: 600
    });
  });
});

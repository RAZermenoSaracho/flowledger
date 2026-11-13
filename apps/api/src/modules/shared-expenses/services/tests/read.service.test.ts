import { beforeEach, describe, expect, it } from "vitest";
import { publicUserSelect } from "../../../users/utils/publicUser.js";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import {
  assertOwnedSharingTransaction,
  getOwnedTransaction,
  getSharedExpenseById,
  listSharedExpenses,
  normalizeSharedExpenseParticipants
} from "../read.service.js";

describe("getOwnedTransaction", () => {
  it("returns null when no transactionId is given", async () => {
    expect(await getOwnedTransaction("user-1", undefined)).toBeNull();
  });

  it("throws a 400 when the transaction doesn't belong to the user", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(null);

    await expect(getOwnedTransaction("user-1", "txn-1")).rejects.toThrow(
      "Transaction does not exist for this user"
    );
  });

  it("returns the transaction when owned", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({ id: "txn-1" } as never);

    expect(await getOwnedTransaction("user-1", "txn-1")).toMatchObject({
      id: "txn-1"
    });
  });
});

describe("assertOwnedSharingTransaction", () => {
  it("scopes the lookup by owner and 404s for a missing or foreign transaction", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(null);

    await expect(assertOwnedSharingTransaction("user-1", "txn-1")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "txn-1", userId: "user-1" } })
    );
  });

  it("allows an owned transaction without a group", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({ groupId: null } as never);

    await expect(assertOwnedSharingTransaction("user-1", "txn-1")).resolves.toBeUndefined();
  });

  it("passes for an owned group transaction", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({ groupId: "g1" } as never);

    await expect(assertOwnedSharingTransaction("user-1", "txn-1")).resolves.toBeUndefined();
  });
});

describe("normalizeSharedExpenseParticipants", () => {
  beforeEach(() => {
    prismaMock.userBlock.findMany.mockResolvedValue([]);
  });

  it("rejects an invitee blocked in either direction with the generic message", async () => {
    prismaMock.userBlock.findMany.mockResolvedValue([{ blockerId: "user-2", blockedId: "owner-1" }] as never);

    await expect(
      normalizeSharedExpenseParticipants("owner-1", [{ userId: "user-2", share: "50" }])
    ).rejects.toMatchObject({ statusCode: 400, message: "This user can't be invited." });
  });

  it("does not re-check blocks for users already on the shared expense", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-2", username: "friend" }] as never);

    await normalizeSharedExpenseParticipants("owner-1", [{ userId: "user-2", share: "50" }], {
      existingUserIds: new Set(["user-2"])
    });

    expect(prismaMock.userBlock.findMany).not.toHaveBeenCalled();
  });

  it("names manual participants by manualName without touching the database", async () => {
    const result = await normalizeSharedExpenseParticipants("owner-1", [{ manualName: "Cash Friend", share: "50" }]);
    expect(result).toEqual([{ manualName: "Cash Friend", share: "50", participantName: "Cash Friend" }]);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("throws a 400 when a participant is the owner themself", async () => {
    await expect(
      normalizeSharedExpenseParticipants("owner-1", [{ userId: "owner-1", share: "50" }])
    ).rejects.toThrow("Shared transaction participants cannot include the owner");
  });

  it("throws a 400 when the same app user is listed twice", async () => {
    await expect(
      normalizeSharedExpenseParticipants("owner-1", [
        { userId: "user-2", share: "10" },
        { userId: "user-2", share: "20" }
      ])
    ).rejects.toThrow("A participant can only be added once");
  });

  it("allows non-Group users and manual participants (universal sharing)", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-2", username: "outsider" }] as never);

    const result = await normalizeSharedExpenseParticipants("owner-1", [
      { userId: "user-2", share: "10" },
      { manualName: "Cash Friend", share: "5" }
    ]);

    expect(result).toHaveLength(2);
    expect(prismaMock.groupMember.count).not.toHaveBeenCalled();
  });

  it("throws a 400 when a referenced user doesn't exist", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    await expect(
      normalizeSharedExpenseParticipants("owner-1", [{ userId: "user-2", share: "50" }])
    ).rejects.toThrow("One or more participants do not exist");
  });

  it("stores a username snapshot, never the name, for each registered participant", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-2", username: "current" }] as never);

    const result = await normalizeSharedExpenseParticipants("owner-1", [{ userId: "user-2", share: "50" }]);

    expect(result[0]).toMatchObject({ participantName: "@current" });
  });
});

describe("listSharedExpenses", () => {
  it("scopes to shared expenses the user owns or participates in", async () => {
    prismaMock.sharedExpense.findMany.mockResolvedValue([{ id: "se-1" }] as never);
    prismaMock.sharedExpense.count.mockResolvedValue(1);

    await listSharedExpenses("user-1", undefined);

    expect(prismaMock.sharedExpense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ ownerUserId: "user-1" }, { participants: { some: { userId: "user-1" } } }]
        })
      })
    );
  });

  it.each(["transaction.notes", "transaction.accountId", "owner.passwordHash"])(
    "rejects a filter or sort on %s before querying",
    async (field) => {
      prismaMock.sharedExpense.findMany.mockClear();
      const filter = JSON.stringify({ where: { field, op: "=", value: "x" } });
      const sort = JSON.stringify({ sort: [{ field, direction: "asc" }] });

      await expect(listSharedExpenses("user-1", filter)).rejects.toMatchObject({ statusCode: 400 });
      await expect(listSharedExpenses("user-1", sort)).rejects.toMatchObject({ statusCode: 400 });
      expect(prismaMock.sharedExpense.findMany).not.toHaveBeenCalled();
    }
  );

  it("rejects invalid query JSON", async () => {
    await expect(
      listSharedExpenses("user-1", "not json")
    ).rejects.toThrow("Invalid shared-expenses query: not valid JSON");
  });

  it("includes the public owner and participant users alongside the transaction", async () => {
    prismaMock.sharedExpense.findMany.mockResolvedValue([{ id: "se-1" }] as never);
    prismaMock.sharedExpense.count.mockResolvedValue(1);

    await listSharedExpenses("user-1", undefined);

    expect(prismaMock.sharedExpense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          transaction: true,
          participants: { include: { user: { select: publicUserSelect } } },
          owner: { select: publicUserSelect }
        }
      })
    );
  });
});

describe("getSharedExpenseById", () => {
  it("throws a 404 when not found or not visible to the user", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue(null);

    await expect(getSharedExpenseById("user-1", "se-1")).rejects.toThrow(
      "Shared expense not found"
    );
  });

  it("returns the shared expense when the user owns or participates in it", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue({ id: "se-1" } as never);

    expect(await getSharedExpenseById("user-1", "se-1")).toMatchObject({
      id: "se-1"
    });
  });

  it("includes the public owner and participant users alongside the transaction", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue({ id: "se-1" } as never);

    await getSharedExpenseById("user-1", "se-1");

    expect(prismaMock.sharedExpense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          transaction: true,
          participants: { include: { user: { select: publicUserSelect } } },
          owner: { select: publicUserSelect }
        }
      })
    );
  });
});

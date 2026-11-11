import { beforeEach, describe, expect, it } from "vitest";
import { publicUserSelect } from "../../../users/utils/publicUser.js";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import {
  assertOwnedGroupTransaction,
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

describe("assertOwnedGroupTransaction", () => {
  it("scopes the lookup by owner and 404s for a missing or foreign transaction", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(null);

    await expect(assertOwnedGroupTransaction("user-1", "txn-1")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "txn-1", userId: "user-1" } })
    );
  });

  it("400s for a transaction without a group", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({ groupId: null } as never);

    await expect(assertOwnedGroupTransaction("user-1", "txn-1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("passes for an owned group transaction", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({ groupId: "g1" } as never);

    await expect(assertOwnedGroupTransaction("user-1", "txn-1")).resolves.toBeUndefined();
  });
});

describe("normalizeSharedExpenseParticipants", () => {
  beforeEach(() => {
    prismaMock.userBlock.findMany.mockResolvedValue([]);
  });

  it("rejects an invitee blocked in either direction with the generic message", async () => {
    prismaMock.userBlock.findMany.mockResolvedValue([{ blockerId: "user-2", blockedId: "owner-1" }] as never);

    await expect(
      normalizeSharedExpenseParticipants("owner-1", [
        { userId: "user-2", participantName: "Friend", shareAmount: 50 }
      ] as never)
    ).rejects.toMatchObject({ statusCode: 400, message: "This user can't be invited." });
  });

  it("returns participants unchanged when none reference a userId", async () => {
    const participants = [{ participantName: "Cash Friend", shareAmount: 50 }];
    const result = await normalizeSharedExpenseParticipants(
      "owner-1",
      participants as never
    );
    expect(result).toEqual(participants);
  });

  it("throws a 400 when a participant is the owner themself", async () => {
    await expect(
      normalizeSharedExpenseParticipants("owner-1", [
        { userId: "owner-1", participantName: "Me", shareAmount: 50 }
      ] as never)
    ).rejects.toThrow("Shared transaction participants cannot include the owner");
  });

  it("throws a 400 when a group split includes a non-app-user participant", async () => {
    await expect(
      normalizeSharedExpenseParticipants(
        "owner-1",
        [{ participantName: "Cash Friend", shareAmount: 50 }] as never,
        "group-1"
      )
    ).rejects.toThrow("Group split participants must be app users");
  });

  it("throws a 400 when a group-split participant isn't a member of the group", async () => {
    prismaMock.groupMember.count.mockResolvedValue(0);

    await expect(
      normalizeSharedExpenseParticipants(
        "owner-1",
        [{ userId: "user-2", participantName: "Friend", shareAmount: 50 }] as never,
        "group-1"
      )
    ).rejects.toThrow("Group split participants must be group members");
  });

  it("throws a 400 when a referenced user doesn't exist", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    await expect(
      normalizeSharedExpenseParticipants("owner-1", [
        { userId: "user-2", participantName: "Friend", shareAmount: 50 }
      ] as never)
    ).rejects.toThrow("One or more participants do not exist");
  });

  it("stores a username snapshot, never the name, for each registered participant", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-2", username: "current" }
    ] as never);

    const result = await normalizeSharedExpenseParticipants("owner-1", [
      { userId: "user-2", participantName: "Stale Name", shareAmount: 50 }
    ] as never);

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

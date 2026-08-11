import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import {
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

describe("normalizeSharedExpenseParticipants", () => {
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

  it("fills in each registered participant's current display name", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-2", name: "Current Name" }
    ] as never);

    const result = await normalizeSharedExpenseParticipants("owner-1", [
      { userId: "user-2", participantName: "Stale Name", shareAmount: 50 }
    ] as never);

    expect(result[0]).toMatchObject({ participantName: "Current Name" });
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

  it("rejects invalid query JSON", async () => {
    await expect(
      listSharedExpenses("user-1", "not json")
    ).rejects.toThrow("Invalid shared-expenses query: not valid JSON");
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
});

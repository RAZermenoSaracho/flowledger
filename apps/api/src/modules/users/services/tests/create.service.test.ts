import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { blockUser } from "../create.service.js";

function runTx(tx: unknown) {
  (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
    (arg as (tx: unknown) => unknown)(tx)
  );
}

describe("blockUser", () => {
  it("rejects blocking oneself and unknown users with 400", async () => {
    await expect(blockUser("u1", "u1")).rejects.toMatchObject({ statusCode: 400 });
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(blockUser("u1", "ghost")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("upserts the block and rejects only the blocker's proposed shares from the blocked owner", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u2" } as never);
    const tx = {
      userBlock: {
        upsert: vi.fn().mockResolvedValue({
          id: "b1",
          createdAt: new Date(0),
          blocked: { id: "u2", username: "bo", name: "Bo", identityVisibility: "username_and_name" }
        })
      },
      sharedExpenseParticipant: { updateMany: vi.fn() }
    };
    runTx(tx);

    const result = await blockUser("u1", "u2");

    expect(tx.userBlock.upsert.mock.calls[0]![0].where).toEqual({ blockerId_blockedId: { blockerId: "u1", blockedId: "u2" } });
    expect(tx.sharedExpenseParticipant.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", acceptance: "proposed", sharedExpense: { ownerUserId: "u2" } },
      data: { acceptance: "rejected" }
    });
    expect(result).toEqual({ id: "b1", createdAt: new Date(0), user: { id: "u2", username: "bo", nickname: null, displayName: "Bo" } });
  });
});
